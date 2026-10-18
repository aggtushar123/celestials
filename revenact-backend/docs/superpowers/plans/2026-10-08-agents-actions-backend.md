# Agents, delivery 1 ("the action layer"): backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three function agents (CS, Sales, Ops) run nightly and on demand. Each pass makes one structured model call, and every action it proposes is checked against a registry of ten action kinds. Actions apply on their own or wait for a person, depending on a per-agent Auto/Ask/Never grid. People decide them in Work › Recommended and Brain › Waiting on you, see them in an Activity list, and can undo them for 7 days. Each agent has a monthly credit budget.

**Architecture:**
- **Today's `metrics.Proposal` is renamed in place to `metrics.AgentAction`.** It is the same table (`db_table = "metrics_proposal"`, kept as the contract asks) and the same ids, with new columns. Every reader moves onto it, and no second store exists to keep in step.
- **A new `services/agents` app holds the logic.** It owns the per-agent rows (`AgentProfile`, `AgentPolicy`), the registry (`kinds.py`, `registry.py`, `actions/`), books and evidence (`evidence.py`, `prompt.py`), the pass (`run.py`), deciding, undo, payloads and the API.
- **Applying an action goes through the same write path a person uses:** `add_task`, `record_changes`, `after_customer_update`, `AIAttributeValue` rows, `Note`, `create_initiative`. Every rule, event, audit row and notification therefore fires as usual.
- **Work › Recommended routes `proposed` actions.** The recommendation kind is renamed `agent_action`. Brain › Waiting lists the same actions.

**Tech Stack:** Django 5.2, DRF, PostgreSQL (CI and prod 16, local 15), Anthropic through `services.copilot.anthropic_client.get_completion`, Channels notifications, billing credits.

**Spec:** react-ts-app `docs/superpowers/specs/2026-10-08-agents-round-design.md` §1, §4–§6.

**API contract:** `docs/superpowers/plans/2026-10-08-agents-actions-api.md`. It is binding on shapes, messages and codes. Where this plan departs from the contract, the Decisions below say so; the contract gaps are listed at the end. The Work round D3 backend plan (`docs/superpowers/plans/2026-10-08-work-tracking-backend.md`) sets the house style. Read the spec section and the contract alongside this plan.

## Global Constraints

**Worktree and git:**
- Work in `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/agents-be`, on branch `feat/agents-actions`, based on `origin/main` (`f197640`).
- The worktree has its own `venv`, which is untracked. Never commit `venv` or `.superpowers`.
- Always `git add <explicit paths>`. Never `git add -A` or `git add .`.
- **Never use `git stash`.**

**Commands:**
- Tests: `venv/bin/python manage.py test <labels> --parallel auto --noinput`.
- Migrations: `venv/bin/python manage.py makemigrations <app> --name <name>`.
- Lint: `venv/bin/ruff check .` and `venv/bin/ruff format --check .`. Ruff formats Python inside Markdown fences too, so doc code blocks must stay ruff-clean.
- Installing packages: use `venv/bin/python -m pip`.

**Commit messages:** conventional (`feat(agents): ...`, `refactor(metrics): ...`, `test(agents): ...`, `docs: ...`), ending with exactly this line: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

**Postgres 16:** never join and then `.distinct()`. Filter with `id__in` subqueries. Account has **no** organisation FK; reach it through `Account.customers.through`.

**The twice-filter:** every list or count combines the action's own rule with a record the reader may open. Anything outside is counted, never named.

**Evidence:** `evidence` lines go only to `view_all_accounts` readers, as for Brain's proposals. `rationale` goes to anyone who may read the action.

**SOC 2:**
- Every access decision carries a `# SOC2:AUTH-02 ...` comment.
- Every decision, undo, settings change and Run now writes `audit.record(...)` (`# SOC2:LOG-01`).
- A logged exception logs its class name only.

**Jobs never fail each other:** each workspace and each agent fails on its own. Nightly jobs read only `Organisation.Status.ACTIVE` workspaces.

**Migrations:** `metrics 0011_agent_action`, `work 0004_agent_action`, `notifications 0010_agent_action_undone`, `agents 0001_initial`. The local dev DB is shared with other worktrees, so run `migrate` only in Task 12.

**Fixtures:**
- Reuse `BrainFixture` (`services/brain/tests/fixtures.py`) and its `person()`, which defaults to function CS with a known password. **Never write a literal password into plan or test code** (gitleaks).
- Test helpers must not shadow fixture attributes such as `org`, `today` or `csm`.
- The task PATCH body uses `assignee_id`.

**Docs in the same PR:** `docs/API_CONTRACTS.md` (follow the api-contracts skill), `docs/audit-events.md`, and the backend product docs `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md` and `06-implementation-plan.md`.

**Out of scope:**
- The frontend.
- Delivery 2: `draft.reply`, `plan.start`.
- Delivery 3: the builder kinds.
- Write-back to connected tools.
- Removing the `/metrics/proposals/` wrappers (delivery 2).

## Decisions (where the spec or the contract leaves a choice)

1. **Rename in place, and keep the table.** `metrics.Proposal` becomes `metrics.AgentAction` through `RenameModel`, and the field `action` becomes `payload`. `Meta.db_table = "metrics_proposal"`, so the legacy table is kept, as the contract's Compatibility section asks, and no table is dropped or renamed. Ids are kept, so the contract's "copy every Proposal" becomes a data migration over the same rows, and `legacy_proposal_id` is not needed: a proposal's id *is* its action's id. The related names (`organisation.proposals`, `initiative.proposals`, `session.proposals`) stay for this release. The model stays in `services.metrics`, and the logic lives in `services.agents`.
2. **Books.**
   - The CS and Sales books are live (unarchived, unchurned) organisations whose `owner.function` is CS or Sales and whose owner is active, plus accounts under live organisations whose own owner matches the same test.
   - The Ops book is every live organisation and every account under one.
   - Each book is capped at the 15 records with the nearest renewal (no date last), then the highest ARR.
   - The agent therefore only sees records its function's own people own, and each owner may open their own record. That is the "union of what the function may open", without computing anyone's visibility.
3. **Evidence per record:** ref (`customer:12`), name, owner, lifecycle, renewal date, health category, ARR (organisations only), current AI attribute values, up to 5 open non-plan tasks, and the titles of the last 3 notes.
   - Members are the workspace's active people.
   - The Ops agent also gets today's `proposals.build_evidence` figures, for initiatives.
   - Tasks on a plan are left out (a plan's tasks keep the plan's rules), so no `task.*` kind can touch them.
4. **Basis and expiry.**
   - When an action is created, `before` holds the current value of what it would change (a kind's `current`). For the create kinds it is `None`.
   - **Stale:** an action is stale, and expires with reason `changed`, when `current` no longer equals `before`. This is checked at decision time (approve) and before an Auto apply.
   - **Waited:** it expires with reason `waited` after 14 days in `proposed`, checked at decision time and by each pass.
   - **Never:** it expires with reason `never` when the PATCH sets its kind to Never.
   - **Not re-proposed:** it expires with reason `not_reproposed` when a *successful* pass of its agent does not propose it again. Facilitator rows (`session` set) and migrated rows (`target` starting `legacy:`) are exempt from this rule only.
   - **Replaced:** if the same kind, record and target come back with a different payload, the open action expires with reason `replaced` and the new one is created.
5. **The target and one-open rule.**
   - `target` is a kind-specific key for what an action changes: `lifecycle`, `owner`, `attribute:<id>`, `task:<id>:assignee`, `task:<id>:due` (shared by redate and snooze), `task:<id>:status`, `task:<title casefold>`, `note:<title casefold>`, `initiative:<metric>:<dimension>:<member>`.
   - A partial unique constraint `(organisation, kind, customer, account, target) WHERE status = 'proposed'` with `nulls_distinct=False` keeps one open action per kind, record and target.
6. **Drop rules,** in order:
   1. a kind the agent may not use, or set to Never;
   2. a record ref not in the evidence, or a record given for a workspace-level kind;
   3. `validate` refuses it;
   4. an open action with the same kind, record and target and an identical payload (counted as re-proposed, not created);
   5. the same kind, record, target and payload rejected or undone in the last 14 days.
7. **Auto that cannot apply.** An Auto action whose `apply` raises `Stale` (for example, the new owner can no longer open the record) stays `proposed` for a person, rather than expiring silently.
8. **Budget accounting.**
   - Each agent's calls use the purpose `agent_<kind>`, so `get_completion` charges billing credits as today.
   - Spend is `ModelCall` rows with that purpose and `outcome=ok` since the 1st of the month (the workspace's local midnight), times `BILLING_CREDITS_PER_MODEL_CALL`.
   - The default budget is `round(plan.monthly_credits * 0.2 / 3)`, stored on the profile when it is created.
   - Today's `proposals` purpose stays for history, and new Ops calls are `agent_ops`.
9. **Order in the nightly job.** The agents' pass runs *before* `recommend.refresh_all`, after health, sentiment, anomalies and the rest are fresh, so Recommended routes new actions the same night. The spec says "after Recommended"; that would delay routing by a day.
10. **Who decides:**
    - an action on a record: the record's owner, anyone above them, or view-all;
    - `initiative.create`: view-all only;
    - undo: the same rule.

    Work › Recommended keeps its own rule for the `task.create` recommendations it routes (recipient, chain, company).
11. **Waiting shows workspace-level actions to view-all readers only,** the same as Activity. Today an initiative proposal shows to everyone with its evidence trimmed; that changes.
12. **Recommended and non-task kinds.**
    - Recommendations are made only for record-level actions. `initiative.create` appears only in Waiting.
    - Assign on a non-`task.create` recommendation is refused with `400 {"code": "USE_APPLY", "detail": "Apply or reject this one instead."}`. The contract is silent on this case.
    - Dismiss works on every kind and rejects the action.
    - A settled recommendation maps as: applied → `assigned` (task set for `task.create`), rejected → `dismissed` (reason other), expired → `expired`.
13. **The Work source key stays `agent`** (contract). Only the recommendation kind is renamed. `recommend.refresh` reads a kind's settings through `source_key(kind)`, which maps `agent_action` to `"agent"`. For `agent_action` rows, `why` is `{facts: [], evidence: []}`: the card shows the action's own rationale and evidence.
14. **Prompt rules:**
    - one system prompt per agent;
    - it lists only that agent's allowed kinds, with their payload shapes;
    - it carries the workspace's tone;
    - it asks for at most 8 actions as a JSON array;
    - it forbids anything sent to a customer;
    - it tells the model to propose nothing rather than guess;
    - the evidence is rendered as plain lines with refs and ids.
15. **Facilitator.** `metrics.facilitator` still asks its own question in the old `task`/`initiative` words. `proposals.store_answer` maps those to `task.create`/`initiative.create` rows (agent `ops`). A row whose target collides with an open action is skipped.
16. **Note author.** An agent's note is written with `author=None` and `author_name` set to the agent's label ("CS agent").
17. **Attribute writes** append an `AIAttributeValue` with `origin=ai`, `reasoning=` the action's rationale, and `set_by=` the decider (`None` on Auto). Undo deletes that row only while it is still the newest.
18. **Snooze** moves the due date and writes a `comment` TaskEvent, "Snoozed by the CS agent: <reason>", with no actor.
19. **`task.complete`** must quote, in `because`, one of the action's own evidence strings. Its `before` is `{status, blocked_reason}`, so undo restores a Blocked task with its reason.

20. **The Brain graph is unchanged** (contract). `proposal_part` keeps its `proposal` nodes, read from the same rows, limited to the Ops agent's `task.create` and `initiative.create` proposals, which is what the graph showed before.
21. **`GET /agents/settings/` carries `can_run`:** `manage_org_settings` or `view_all_accounts`, the Run now rule.
22. **`GET /agents/actions/<id>/`** returns one action for the reader, with the same 404 rule as the decision routes (`readable`). It sits behind the undo notice's link.
---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `services/metrics/models.py` | modify | `Proposal` → `AgentAction` (agents, kinds, statuses, the new columns, constraint, `record`) |
| `services/metrics/migrations/0011_agent_action.py` | create (empty, then hand-written) | rename, columns, data, constraint |
| `services/metrics/proposals.py` | modify | `store_answer`, `_validate` and `approve`/`reject` on the new model (the facilitator path and the wrappers) |
| `services/metrics/proposal_access.py`, `facilitator.py`, `graph.py`, `views.py` | modify | new model; legacy payload; wrappers |
| `services/brain/{waiting,desk,graph,views}.py`, `services/copilot/{skills,brain_grounding,usage}.py` | modify | new model; kind `agent_action` in Waiting |
| `services/work/{models,sources,routing,defaults,deciding,recommend,recommendations,rec_access,views}.py` | modify | kind and field `agent_action` |
| `services/agents/__init__.py`, `apps.py` | create | the app |
| `services/agents/models.py` | create | `AgentProfile`, `AgentPolicy` |
| `services/agents/policy.py` | create | profiles, levels, budgets |
| `services/agents/kinds.py` | create | `Kind`, levels, `Invalid`, `Stale`, `ChangedSince` |
| `services/agents/actions/{records,tasks,notes,initiatives}.py` | create | the ten kinds |
| `services/agents/registry.py` | create | `REGISTRY`, `kinds_for` |
| `services/agents/evidence.py` | create | books, `Context`, evidence |
| `services/agents/prompt.py` | create | system prompt and rendering |
| `services/agents/run.py` | create | the pass, `run_all` |
| `services/agents/deciding.py` | create | `decided_as`, approve, reject, expiry, `apply_action` |
| `services/agents/undo.py` | create | undo and its notice |
| `services/agents/payloads.py` | create | the AgentAction and AgentCard shapes |
| `services/agents/settings_api.py` | create | settings payload and PATCH validation |
| `services/agents/views.py`, `urls.py` | create | the routes |
| `services/agents/tests/*` | create | tests |
| `services/notifications/models.py` | modify | `AGENT_ACTION_UNDONE` |
| `config/settings.py`, `config/urls.py` | modify | app and routes |
| `services/customers/management/commands/run_health_maintenance.py` | modify | the nightly pass |

---

### Task 1: Rename `Proposal` to `AgentAction` in place

Behaviour does not change in this task. Every existing API answers exactly as before, and the full suite stays green. Only the model, its kinds and its storage change.

**Files:**
- Modify: `services/metrics/models.py:239-310`
- Create: `services/metrics/migrations/0011_agent_action.py`
- Modify every reader:
  - `services/metrics/{proposals,proposal_access,facilitator,graph,views,feedback}.py`
  - `services/brain/{waiting,desk,graph}.py`
  - `services/copilot/skills.py`
  - `services/work/{models,sources,routing,defaults,deciding,recommend,rec_access,recommendations}.py`
- Modify these tests:
  - `services/metrics/tests/{test_proposals,test_proposal_access,test_feedback,test_graph,test_facilitator}.py`
  - `services/brain/tests/{waiting_fixtures,test_waiting,test_waiting_e2e,test_graph,test_desk,test_deciding}.py`
  - `services/work/tests/{recommend_fixtures,test_deciding,test_sources_work,test_recommendations_api}.py`
  - `services/copilot/tests/{test_skills,test_pipelines_grounding,test_pipelines_context}.py`
- Test: `services/metrics/tests/test_agent_action_model.py` (new)

**Interfaces:**
- Produces:
  - `services.metrics.models.AgentAction`
  - `AgentAction.Agent` (`CS="cs"`, `SALES="sales"`, `OPS="ops"`)
  - `AgentAction.Kind` (the ten keys of the contract's table, in that order)
  - `AgentAction.Status` (`PROPOSED`, `APPLIED`, `REJECTED`, `EXPIRED`, `UNDONE`)
  - fields: `agent`, `customer`, `account`, `target`, `payload`, `before`, `after`, `auto`, `applied_at`, `undone_by`, `undone_at`, `expired_reason`
  - the `record` and `workspace_level` properties
  - `services.metrics.proposals.LEGACY_KINDS = {"task": "task.create", "initiative": "initiative.create"}`
- `task.create` payload: `{title, assignee_id (int|None), assignee_name (str), due_date (ISO), priority}`, with the organisation in the `customer` FK.
- `initiative.create` payload: today's initiative action dict.

- [ ] **Step 1: Write the failing test**

Create `services/metrics/tests/test_agent_action_model.py`:

```python
"""Proposal became AgentAction in place (Agents round Decision 1): same rows,
same ids, the old kinds and statuses renamed, the customer a real FK."""

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from services.brain.tests.fixtures import BrainFixture
from services.metrics.models import AgentAction


def task_action(organisation, customer, *, title="Call the exec sponsor", **fields):
    return AgentAction.objects.create(
        organisation=organisation,
        batch="b1",
        kind=AgentAction.Kind.TASK_CREATE,
        customer=customer,
        target=f"task:{title.casefold()}",
        title=title,
        rationale="Because.",
        evidence=["Pizza Hut renews in 30 days"],
        payload={
            "title": title,
            "assignee_id": None,
            "assignee_name": "Carl CSM",
            "due_date": (timezone.localdate() + timedelta(days=7)).isoformat(),
            "priority": "high",
        },
        **fields,
    )


class AgentActionModelTests(BrainFixture):
    def test_defaults(self):
        action = task_action(self.org, self.pizza)
        self.assertEqual(action.agent, AgentAction.Agent.OPS)
        self.assertEqual(action.status, AgentAction.Status.PROPOSED)
        self.assertEqual(action.record, self.pizza)
        self.assertFalse(action.workspace_level)
        self.assertFalse(action.auto)

    def test_an_initiative_is_workspace_level(self):
        action = AgentAction.objects.create(
            organisation=self.org,
            batch="b1",
            kind=AgentAction.Kind.INITIATIVE_CREATE,
            target="initiative:nrr::",
            title="Lift NRR",
            rationale="x",
            payload={"metric": "nrr"},
        )
        self.assertIsNone(action.record)
        self.assertTrue(action.workspace_level)

    def test_one_open_action_per_kind_record_and_target(self):
        task_action(self.org, self.pizza)
        with self.assertRaises(IntegrityError), transaction.atomic():
            task_action(self.org, self.pizza)
        # A decided one does not count.
        AgentAction.objects.update(status=AgentAction.Status.REJECTED)
        task_action(self.org, self.pizza)

    def test_workspace_level_actions_are_one_open_too(self):
        def make():
            return AgentAction.objects.create(
                organisation=self.org,
                batch="b1",
                kind=AgentAction.Kind.INITIATIVE_CREATE,
                target="initiative:nrr::",
                title="Lift NRR",
                rationale="x",
                payload={},
            )

        make()
        with self.assertRaises(IntegrityError), transaction.atomic():
            make()
```

The data migration has its own test at the end of this task (Step 5).

- [ ] **Step 2: Run it and watch it fail**

Run: `venv/bin/python manage.py test services.metrics.tests.test_agent_action_model --parallel auto --noinput`
Expected: `ImportError: cannot import name 'AgentAction'`.

- [ ] **Step 3: Rewrite the model**

In `services/metrics/models.py`, replace `class Proposal(...)` (its docstring, choices, fields and Meta) with:

```python
class AgentAction(models.Model):
    """Something an agent did or wants to do (Agents round §1.3). Formerly
    `Proposal`, renamed in place: the same rows and ids.

    Three agents propose actions: CS, Sales and Ops. The Ops agent was the
    one Brain asked and the session facilitator wrote for. Each action is
    one kind from `services.agents.registry`. It waits as `proposed` for a
    person, or is applied on its own when Actions & approvals allows it,
    and applying runs through the same paths a person uses.

    `before` is the value it would change, read when it was proposed; a
    decision on an action whose record has moved on since expires it
    instead. `after` is what applying set, which undo compares against.
    `target` is what one open action is kept per (Decision 5)."""

    class Agent(models.TextChoices):
        CS = "cs", "CS agent"
        SALES = "sales", "Sales agent"
        OPS = "ops", "Ops agent"

    class Kind(models.TextChoices):
        RECORD_LIFECYCLE = "record.lifecycle", "Change lifecycle stage"
        RECORD_OWNER = "record.owner", "Change owner"
        RECORD_ATTRIBUTE = "record.attribute", "Set an AI attribute"
        TASK_CREATE = "task.create", "Create a task"
        TASK_REASSIGN = "task.reassign", "Reassign a task"
        TASK_REDATE = "task.redate", "Change a task's due date"
        TASK_COMPLETE = "task.complete", "Mark a task done"
        TASK_SNOOZE = "task.snooze", "Snooze a task"
        NOTE_CREATE = "note.create", "File a note"
        INITIATIVE_CREATE = "initiative.create", "Start an initiative"

    class Status(models.TextChoices):
        PROPOSED = "proposed", "Proposed"
        APPLIED = "applied", "Applied"
        REJECTED = "rejected", "Rejected"
        EXPIRED = "expired", "Expired"
        UNDONE = "undone", "Undone"

    organisation = models.ForeignKey(
        Organisation, related_name="proposals", on_delete=models.CASCADE
    )
    agent = models.CharField(max_length=8, choices=Agent.choices, default=Agent.OPS)
    batch = models.CharField(max_length=32, help_text="One run; its actions share it.")
    kind = models.CharField(max_length=24, choices=Kind.choices)
    customer = models.ForeignKey(
        "customers.Customer",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="agent_actions",
    )
    account = models.ForeignKey(
        "customers.Account",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="agent_actions",
    )
    target = models.CharField(max_length=160, blank=True)
    title = models.CharField(max_length=255)
    rationale = models.TextField(help_text="Why, in the agent's words, citing the evidence.")
    evidence = models.JSONField(default=list, help_text="The figures cited, as given to the agent.")
    payload = models.JSONField(help_text="Exactly what applying does, validated when proposed.")
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    initiative = models.ForeignKey(
        Initiative,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="proposals",
        help_text="The open initiative this serves, if the agent linked one.",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PROPOSED)
    auto = models.BooleanField(default=False)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True)
    applied_at = models.DateTimeField(null=True, blank=True)
    undone_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    undone_at = models.DateTimeField(null=True, blank=True)
    expired_reason = models.CharField(max_length=24, blank=True)
    result = models.JSONField(
        default=dict, blank=True, help_text="What applying created, e.g. a task id."
    )
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    session = models.ForeignKey(
        "copilot.CopilotSession",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="proposals",
        help_text="Set when the facilitator wrote this from a multiplayer session's "
        "decisions rather than an agent from the figures alone.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # The legacy table is kept (contract, Compatibility): same rows, same ids.
        db_table = "metrics_proposal"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organisation", "status", "agent"], name="agent_action_queue"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "kind", "customer", "account", "target"],
                condition=models.Q(status="proposed"),
                nulls_distinct=False,
                name="agent_action_one_open",
            ),
        ]

    def __str__(self):
        # Not the title: an audit row records this, and the title names a record.
        return f"Agent action {self.pk} ({self.kind})"

    @property
    def record(self):
        if self.account_id is not None:
            return self.account
        return self.customer

    @property
    def workspace_level(self):
        return self.kind == self.Kind.INITIATIVE_CREATE
```

- [ ] **Step 4: Hand-write the migration**

Run `venv/bin/python manage.py makemigrations metrics --empty --name agent_action`. The rename can't be autodetected without an interactive prompt. Then replace the generated file's body with:

```python
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

LEGACY = {"task": "task.create", "initiative": "initiative.create"}


def forwards(apps, schema_editor):
    """Each old proposal becomes the action it always was: an Ops agent's
    task or initiative. A task's organisation moves from the JSON into the
    FK; one that no longer exists leaves a waiting task expired."""
    AgentAction = apps.get_model("metrics", "AgentAction")
    Customer = apps.get_model("customers", "Customer")
    for action in AgentAction.objects.all().iterator():
        old = action.payload if isinstance(action.payload, dict) else {}
        action.agent = "ops"
        action.target = f"legacy:{action.pk}"
        action.kind = LEGACY.get(action.kind, action.kind)
        if action.kind == "task.create":
            customer_id = old.get("customer_id")
            if (
                isinstance(customer_id, int)
                and Customer.objects.filter(
                    pk=customer_id, organisation_id=action.organisation_id
                ).exists()
            ):
                action.customer_id = customer_id
            elif action.status == "proposed":
                action.status = "expired"
                action.expired_reason = "changed"
            action.payload = {
                "title": old.get("title") or action.title,
                "assignee_id": None,
                "assignee_name": old.get("assignee_name") or "",
                "due_date": old.get("due_date"),
                "priority": old.get("priority") or "medium",
            }
        if action.status == "approved":
            action.status = "applied"
            action.applied_at = action.decided_at
        action.save()


def backwards(apps, schema_editor):
    AgentAction = apps.get_model("metrics", "AgentAction")
    back = {new: old for old, new in LEGACY.items()}
    for action in AgentAction.objects.all().iterator():
        if action.kind not in back:
            action.delete()
            continue
        payload = dict(action.payload or {})
        if action.kind == "task.create" and action.customer_id is not None:
            payload["customer_id"] = action.customer_id
        action.kind = back[action.kind]
        action.payload = payload
        if action.status in ("applied", "undone"):
            action.status = "approved"
        elif action.status == "expired":
            action.status = "rejected"
        action.save()


class Migration(migrations.Migration):
    dependencies = [
        ("metrics", "0010_initiative_baseline_scope"),
        ("customers", "0057_task_tracking"),
        ("copilot", "__latest__"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RenameModel("Proposal", "AgentAction"),
        # Keep the legacy table's name (contract, Compatibility).
        migrations.AlterModelTable("agentaction", "metrics_proposal"),
        migrations.RenameField("agentaction", "action", "payload"),
        migrations.AddField(
            "agentaction",
            "agent",
            models.CharField(
                choices=[("cs", "CS agent"), ("sales", "Sales agent"), ("ops", "Ops agent")],
                default="ops",
                max_length=8,
            ),
        ),
        migrations.AddField(
            "agentaction",
            "customer",
            models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="agent_actions",
                to="customers.customer",
            ),
        ),
        migrations.AddField(
            "agentaction",
            "account",
            models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="agent_actions",
                to="customers.account",
            ),
        ),
        migrations.AddField("agentaction", "target", models.CharField(blank=True, max_length=160)),
        migrations.AddField("agentaction", "before", models.JSONField(blank=True, null=True)),
        migrations.AddField("agentaction", "after", models.JSONField(blank=True, null=True)),
        migrations.AddField("agentaction", "auto", models.BooleanField(default=False)),
        migrations.AddField(
            "agentaction", "applied_at", models.DateTimeField(blank=True, null=True)
        ),
        migrations.AddField(
            "agentaction",
            "undone_by",
            models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            "agentaction", "undone_at", models.DateTimeField(blank=True, null=True)
        ),
        migrations.AddField(
            "agentaction", "expired_reason", models.CharField(blank=True, max_length=24)
        ),
        migrations.AlterField(
            "agentaction",
            "kind",
            models.CharField(
                choices=[
                    ("record.lifecycle", "Change lifecycle stage"),
                    ("record.owner", "Change owner"),
                    ("record.attribute", "Set an AI attribute"),
                    ("task.create", "Create a task"),
                    ("task.reassign", "Reassign a task"),
                    ("task.redate", "Change a task's due date"),
                    ("task.complete", "Mark a task done"),
                    ("task.snooze", "Snooze a task"),
                    ("note.create", "File a note"),
                    ("initiative.create", "Start an initiative"),
                ],
                max_length=24,
            ),
        ),
        migrations.AlterField(
            "agentaction",
            "status",
            models.CharField(
                choices=[
                    ("proposed", "Proposed"),
                    ("applied", "Applied"),
                    ("rejected", "Rejected"),
                    ("expired", "Expired"),
                    ("undone", "Undone"),
                ],
                default="proposed",
                max_length=16,
            ),
        ),
        migrations.RunPython(forwards, backwards),
        migrations.AddIndex(
            "agentaction",
            models.Index(fields=["organisation", "status", "agent"], name="agent_action_queue"),
        ),
        migrations.AddConstraint(
            "agentaction",
            models.UniqueConstraint(
                condition=models.Q(status="proposed"),
                fields=("organisation", "kind", "customer", "account", "target"),
                name="agent_action_one_open",
                nulls_distinct=False,
            ),
        ),
    ]
```

Replace `("copilot", "__latest__")` with the copilot app's real latest migration (`ls services/copilot/migrations | sort | tail -2`). The help-text changes on `batch`, `payload` and `result` are state-only: run `venv/bin/python manage.py makemigrations metrics --name agent_action_help` afterwards. If it produces a migration with only `AlterField` help-text changes, fold those operations into 0011 by hand and delete the extra file. `makemigrations --check --dry-run` must then say "No changes detected".

- [ ] **Step 5: The migration test**

Add to `services/metrics/tests/test_agent_action_model.py`:

```python
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class ProposalMigrationTests(TransactionTestCase):
    """0011 turns yesterday's proposals into Ops agent actions."""

    before = [("metrics", "0010_initiative_baseline_scope")]
    after = [("metrics", "0011_agent_action")]

    def test_proposals_become_actions(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.before)
        old = executor.loader.project_state(self.before).apps
        Organisation = old.get_model("accounts", "Organisation")
        Customer = old.get_model("customers", "Customer")
        Proposal = old.get_model("metrics", "Proposal")
        org = Organisation.objects.create(name="Acme", currency="USD")
        pizza = Customer.objects.create(organisation=org, name="Pizza Hut")
        task = Proposal.objects.create(
            organisation=org,
            batch="b",
            kind="task",
            title="Call",
            rationale="x",
            action={"customer_id": pizza.pk, "title": "Call", "assignee_name": "Carl"},
            status="approved",
        )
        gone = Proposal.objects.create(
            organisation=org,
            batch="b",
            kind="task",
            title="Gone",
            rationale="x",
            action={"customer_id": 999999, "title": "Gone"},
        )
        executor = MigrationExecutor(connection)
        executor.migrate(self.after)
        new = executor.loader.project_state(self.after).apps
        AgentAction = new.get_model("metrics", "AgentAction")
        moved = AgentAction.objects.get(pk=task.pk)
        self.assertEqual(
            (moved.kind, moved.status, moved.agent, moved.customer_id),
            ("task.create", "applied", "ops", pizza.pk),
        )
        self.assertEqual(moved.payload["assignee_name"], "Carl")
        self.assertEqual(moved.target, f"legacy:{task.pk}")
        stale = AgentAction.objects.get(pk=gone.pk)
        self.assertEqual((stale.status, stale.expired_reason), ("expired", "changed"))
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())
```

If a required field breaks `Customer.objects.create(organisation=org, name="Pizza Hut")` in the historical state, add the minimum fields that `services/customers/migrations/0057_task_tracking.py`'s state requires. Never add a password.

- [ ] **Step 6: Move every reader onto the new model, keeping its API**

Make the replacements in the table below, in every non-migration file that `grep -rln "Proposal" services --include="*.py"` lists. Exclude `customers/models.py` and the seed commands, whose "Proposal" is a deal stage. Then make the logic edits shown after the table.

| Old | New |
|---|---|
| `from services.metrics.models import Proposal` / `from .models import ... Proposal` | `... AgentAction` |
| `Proposal.Kind.TASK` | `AgentAction.Kind.TASK_CREATE` |
| `Proposal.Kind.INITIATIVE` | `AgentAction.Kind.INITIATIVE_CREATE` |
| `Proposal.Status.APPROVED` | `AgentAction.Status.APPLIED` |
| `Proposal.Status.PROPOSED` / `REJECTED` | `AgentAction.Status.PROPOSED` / `REJECTED` |
| `Proposal.objects` | `AgentAction.objects` |
| `proposal.action` / `p.action` (the model field) | `.payload` |
| `x.action.get("customer_id")` / `x.action["customer_id"]` on a task | `x.customer_id` |

**`services/metrics/proposals.py`:**
- Add `LEGACY_KINDS = {"task": "task.create", "initiative": "initiative.create"}`.
- In `_validate`, read the model's word through it:

```python
    kind = LEGACY_KINDS.get(str(item.get("kind") or "").strip().lower())
    action = item.get("action") or {}
    title = str(item.get("title") or "").strip()[:255]
    if not title or kind is None or not isinstance(action, dict):
        logger.warning(
            "proposal dropped: kind=%r title=%r action_is_dict=%s",
            item.get("kind"),
            title,
            isinstance(action, dict),
        )
        return None
    item["kind"] = kind
```

- Make the task branch return `{"customer_id", "customer_name", "title", "assignee_name", "due_date", "priority"}`, as today.
- `store_answer` turns that into a row:

```python
def store_answer(organisation, evidence, raw, *, limit, generated_by=None, session=None):
    """Parse one answer, validate each item against what the prompt offered,
    and store the survivors as one batch of Ops agent actions. Used by the
    facilitator, which asks a different question of the same evidence; an
    item colliding with an action already open is skipped (Decision 15)."""
    from django.db import IntegrityError, transaction

    batch = uuid.uuid4().hex
    open_ids = {i["id"] for i in evidence["initiatives"]}
    stored = []
    for item in _parse(raw)[:limit]:
        action = _validate(organisation, evidence, item)
        if action is None:
            continue
        linked = item.get("initiative_id")
        fields = {
            "organisation": organisation,
            "agent": AgentAction.Agent.OPS,
            "batch": batch,
            "kind": item["kind"],
            "title": str(item["title"]).strip()[:255],
            "rationale": str(item.get("rationale") or "").strip(),
            "evidence": [str(e) for e in (item.get("evidence") or []) if isinstance(e, str)][:4],
            "initiative_id": linked if linked in open_ids else None,
            "generated_by": generated_by,
            "session": session,
        }
        if item["kind"] == AgentAction.Kind.TASK_CREATE:
            fields["customer_id"] = action["customer_id"]
            fields["target"] = f"task:{action['title'].casefold()}"[:160]
            fields["payload"] = {
                "title": action["title"],
                "assignee_id": None,
                "assignee_name": action["assignee_name"],
                "due_date": action["due_date"],
                "priority": action["priority"],
            }
        else:
            fields["target"] = (
                f"initiative:{action['metric']}:{action['dimension']}:{action['member']}"
            )[:160]
            fields["payload"] = action
        try:
            with transaction.atomic():
                stored.append(AgentAction.objects.create(**fields))
        except IntegrityError:
            logger.info("facilitator item skipped: an action like it is already open")
    return stored
```

- In `approve`:
  - Use `proposal.customer` instead of looking it up from the JSON.
  - Use `proposal.payload["title"]`, `["due_date"]` and `["priority"]`.
  - Set `proposal.status = AgentAction.Status.APPLIED` and `proposal.applied_at = proposal.decided_at`.
  - Add `"applied_at"` to `update_fields`.
- In `_assignee`, read `proposal.payload.get("assignee_name", "")`.

**Legacy payload** (`services/metrics/views.py` `_proposal_payload`): keep the old shape for the old routes and the Copilot session decisions.

```python
LEGACY_KIND = {
    AgentAction.Kind.TASK_CREATE: "task",
    AgentAction.Kind.INITIATIVE_CREATE: "initiative",
}
LEGACY_STATUS = {
    AgentAction.Status.PROPOSED: ("proposed", "Proposed"),
    AgentAction.Status.APPLIED: ("approved", "Approved"),
    AgentAction.Status.UNDONE: ("approved", "Approved"),
    AgentAction.Status.REJECTED: ("rejected", "Rejected"),
    AgentAction.Status.EXPIRED: ("rejected", "Rejected"),
}


def _legacy_action(action):
    if action.kind != AgentAction.Kind.TASK_CREATE:
        return action.payload
    customer = action.customer
    return {
        "customer_id": action.customer_id,
        "customer_name": customer.name if customer is not None else "",
        **{k: v for k, v in action.payload.items() if k != "assignee_id"},
    }


def _proposal_payload(proposal):
    status_value, status_display = LEGACY_STATUS[proposal.status]
    kind = LEGACY_KIND.get(proposal.kind, proposal.kind)
    return {
        "id": proposal.id,
        "batch": proposal.batch,
        "kind": kind,
        "kind_display": "Task on an account" if kind == "task" else "Initiative",
        "title": proposal.title,
        "rationale": proposal.rationale,
        "evidence": proposal.evidence,
        "action": _legacy_action(proposal),
        "initiative": (
            {"id": proposal.initiative.id, "title": proposal.initiative.title}
            if proposal.initiative_id
            else None
        ),
        "status": status_value,
        "status_display": status_display,
        "decided_by": proposal.decided_by.name if proposal.decided_by else None,
        "decided_at": proposal.decided_at.isoformat() if proposal.decided_at else None,
        "decision_note": proposal.decision_note,
        "result": proposal.result,
        "generated_by": proposal.generated_by.name if proposal.generated_by else None,
        "source": (
            {
                "session_id": proposal.session.id,
                "conversation_id": proposal.session.conversation_id,
                "title": proposal.session.conversation.title,
            }
            if proposal.session_id
            else None
        ),
        "created_at": proposal.created_at.isoformat(),
    }
```

In `ProposalListView`, only list Ops agent actions of the two old kinds:

```python
        queryset = AgentAction.objects.filter(
            organisation=request.user.organisation,
            agent=AgentAction.Agent.OPS,
            kind__in=list(LEGACY_KIND),
        ).select_related("initiative", "decided_by", "generated_by", "session__conversation", "customer")
```

The `?status=` filter maps legacy words through `{"proposed": ["proposed"], "approved": ["applied", "undone"], "rejected": ["rejected", "expired"]}`, as `status__in`.

**`services/brain/waiting.py`:**
- `customer_owner_id(proposal)` returns `proposal.customer.owner_id if proposal.customer_id else None` for `TASK_CREATE`.
- `_proposal_rows` drops its JSON lookup and uses `p.customer` (add `"customer__owner"` to `select_related`).

**`services/brain/desk.py` `proposals()`:** drop the `customer_ref` annotation, `Cast` and `KT` imports, and use the FK:

```python
    base = AgentAction.objects.filter(
        organisation_id=reader.organisation_id,
        status=AgentAction.Status.PROPOSED,
        kind__in=[AgentAction.Kind.TASK_CREATE, AgentAction.Kind.INITIATIVE_CREATE],
    )
    ...
        on_desk = Q(kind=AgentAction.Kind.TASK_CREATE, customer_id__in=owned)
    ...
        readable = waiting.filter(
            Q(kind=AgentAction.Kind.INITIATIVE_CREATE)
            | Q(customer_id__in=visible_customers(reader).values("id"))
        )
```

The `kind__in` filter keeps Brain on the two old kinds until Task 10 opens it to every kind.

**`services/metrics/proposal_access.py`:**
- `wanted = {p.customer_id for p in proposals if p.kind == AgentAction.Kind.TASK_CREATE and p.customer_id}`
- the left-out test reads `proposal.customer_id not in openable`

**`services/metrics/graph.py` `proposal_part`:**
- the edge reads `if p.kind == AgentAction.Kind.TASK_CREATE and p.customer_id in customer_ids:` with target `f"customer:{p.customer_id}"`
- `proposal_kind=LEGACY_KIND.get(p.kind, p.kind)`, importing `LEGACY_KIND` from `.views`; or move both maps to a new `services/metrics/legacy.py` that `views`, `graph` and `proposal_access` import, to avoid a cycle

**`services/copilot/skills.py`:** `AgentAction.objects.filter(organisation=organisation, kind__in=[...the two...])`, with approved counted as `status=AgentAction.Status.APPLIED`.

**Work:**
- `services/work/models.py`: `Recommendation.proposal` becomes `models.ForeignKey("metrics.AgentAction", ...)`. Keep the field name `proposal` until Task 10.
- `services/work/sources.py` `agent()`:
  - `AgentAction.objects.filter(organisation=book.organisation, kind=AgentAction.Kind.TASK_CREATE, status=AgentAction.Status.PROPOSED)`
  - `customer = book.customers.get(proposal.customer_id)`
  - names from `proposal.payload`
- `routing.py`, `defaults.py`: `.payload` in place of `.action`.
- `deciding.py`: `from services.metrics.models import AgentAction` in `_locked`.
- `recommend.settle_for_proposal`: `if proposal.status == AgentAction.Status.APPLIED:`.

**Tests:**
- Replace every `Proposal.objects.create(kind=Proposal.Kind.TASK, action={..."customer_id": X...})` with the same call on `AgentAction` with `kind=AgentAction.Kind.TASK_CREATE`, `customer_id=X`, `target=f"task:{title.casefold()}"`, and `payload` without the `customer_*` keys.
  - `services/work/tests/recommend_fixtures.task_proposal` becomes exactly the `task_action` helper above, keeping its keyword arguments and its `status=` default. `AgentAction.Status.PROPOSED` replaces `Proposal.Status.PROPOSED`.
- Assertions on `status == "approved"` in *model* checks become `AgentAction.Status.APPLIED`. Assertions on *legacy API responses* (`/metrics/proposals/...`) keep `"approved"`.

- [ ] **Step 7: Run the whole suite**

Run:
```bash
venv/bin/python manage.py makemigrations --check --dry-run
venv/bin/python manage.py test --parallel auto --noinput
```
Expected: no changes detected. Every test OK; the only edits to existing tests are the mechanical ones in Step 6.

- [ ] **Step 8: Commit**

```bash
git add services/metrics services/brain services/copilot/skills.py services/copilot/tests services/work
git commit -m "refactor(metrics): Proposal becomes AgentAction in place (same rows, new kinds and columns)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Check `git status` first. Only the files named above may be staged.

---

### Task 2: The agents app — profiles, the grid and budgets

**Files:**
- Create: `services/agents/__init__.py`, `services/agents/apps.py`, `services/agents/models.py`, `services/agents/policy.py`, `services/agents/kinds.py`
- Create: `services/agents/migrations/__init__.py` and `0001_initial.py` (generated)
- Create: `services/agents/tests/__init__.py`, `services/agents/tests/fixtures.py`, `services/agents/tests/test_policy.py`
- Modify: `config/settings.py` (add `"services.agents",` after `"services.work",`)
- Modify: `services/copilot/usage.py` `PURPOSES`

**Interfaces:**
- Produces:
  - `kinds.AUTO`, `ASK`, `NEVER`, `LEVELS` and `RANK`
  - `kinds.Kind` (a dataclass: `key`, `label`, `example`, `max_level`, `agents`, `validate`, `target`, `current`, `preview`, `apply`, `undo`, `workspace_level=False`)
  - the exceptions `kinds.Invalid`, `kinds.Stale` and `kinds.ChangedSince(detail, *, current=None, applied=None)`
  - `kinds.ALL_AGENTS` and `kinds.RECORD_AGENTS`
  - `AgentProfile`: `organisation`, `kind`, `enabled`, `monthly_credits`, `last_run_at`, `last_run`, `updated_by`, `updated_at`
  - `AgentPolicy`: `organisation`, `levels`, `updated_by`, `updated_at`
  - `policy.profiles_for(organisation) -> dict[str, AgentProfile]`
  - `policy.policy_for(organisation) -> AgentPolicy`
  - `policy.level(policy, agent, kind) -> str`
  - `policy.grid(policy) -> dict`
  - `policy.plan_credits(organisation) -> int`
  - `policy.spent_this_month(organisation, agent, *, today) -> int`
  - `policy.resets_on(today) -> date`
  - `policy.LABELS` (`agent -> label`)

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/fixtures.py`:

```python
"""The agents' tests' world: BrainFixture's people and book (Carl owns Pizza
Hut, Dough Co, Pizza EMEA and Taco East and reports to Mona; Dana owns Taco
Bell and Taco West; Mona owns Soup Co; Loose Ltd has no owner; Alice is an
admin with view-all; Lee is Leadership without it; Gus is Globex's). Every
person `person()` makes is in CS unless given another function. `sam` is a
Sales owner of `deals` (an organisation) so the Sales book is not empty."""

from decimal import Decimal

from services.accounts.models import User
from services.brain.tests.fixtures import BrainFixture
from services.customers.models import Customer
from services.segments.tests.fixtures import person


class AgentsFixture(BrainFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.sam = person("sam@acme.io", "Sam Sales", cls.org, function=User.Function.SALES)
        cls.deals = Customer.objects.create(
            organisation=cls.org,
            name="Deals Ltd",
            owner=cls.sam,
            arr_billed_at_account=Decimal(70_000),
            health_score=Decimal("6.0"),
        )

    def client_for(self, user):
        return self.as_user(User.objects.get(pk=user.pk))
```

Create `services/agents/tests/test_policy.py`:

```python
"""Each workspace has three agents, a grid of Auto/Ask/Never, and a monthly
credit budget per agent (spec §1.1, §1.6, §1.7)."""

from datetime import date
from unittest.mock import patch

from django.test import override_settings
from django.utils import timezone

from services.agents import policy
from services.agents.kinds import ASK, AUTO, NEVER
from services.agents.models import AgentPolicy, AgentProfile
from services.agents.tests.fixtures import AgentsFixture
from services.copilot.models import ModelCall


class PolicyTests(AgentsFixture):
    def test_three_profiles_made_once_with_the_default_budget(self):
        with patch.object(policy, "plan_credits", return_value=2000):
            profiles = policy.profiles_for(self.org)
            again = policy.profiles_for(self.org)
        self.assertEqual(list(profiles), ["cs", "sales", "ops"])
        self.assertEqual(profiles["cs"].monthly_credits, 133)
        self.assertTrue(all(p.enabled for p in profiles.values()))
        self.assertEqual(AgentProfile.objects.filter(organisation=self.org).count(), 3)
        self.assertEqual(again["ops"].pk, profiles["ops"].pk)

    def test_everything_starts_on_ask(self):
        grid = policy.grid(policy.policy_for(self.org))
        self.assertEqual(set(grid), {"cs", "sales", "ops"})
        self.assertEqual(set(grid["cs"].values()), {ASK})
        self.assertNotIn("initiative.create", grid["cs"])
        self.assertNotIn("record.lifecycle", grid["ops"])
        self.assertIn("initiative.create", grid["ops"])

    def test_a_stored_level_above_the_cap_reads_as_the_cap(self):
        prefs = policy.policy_for(self.org)
        AgentPolicy.objects.filter(pk=prefs.pk).update(
            levels={"cs": {"record.owner": AUTO, "record.lifecycle": AUTO, "note.create": NEVER}}
        )
        prefs.refresh_from_db()
        self.assertEqual(policy.level(prefs, "cs", "record.owner"), ASK)
        self.assertEqual(policy.level(prefs, "cs", "record.lifecycle"), AUTO)
        self.assertEqual(policy.level(prefs, "cs", "note.create"), NEVER)
        self.assertEqual(policy.level(prefs, "ops", "record.lifecycle"), NEVER)
        self.assertEqual(policy.level(prefs, "cs", "task.redate"), ASK)

    @override_settings(BILLING_CREDITS_PER_MODEL_CALL=2)
    def test_spend_is_this_months_successful_calls(self):
        def call(purpose, outcome="ok"):
            return ModelCall.objects.create(
                organisation=self.org, purpose=purpose, outcome=outcome, model="m"
            )

        call("agent_cs")
        call("agent_cs")
        call("agent_cs", outcome="failed")
        call("agent_sales")
        last_month = call("agent_cs")
        ModelCall.objects.filter(pk=last_month.pk).update(
            created_at=timezone.now().replace(day=1) - timezone.timedelta(days=2)
        )
        today = timezone.localdate()
        self.assertEqual(policy.spent_this_month(self.org, "cs", today=today), 4)
        self.assertEqual(policy.spent_this_month(self.org, "ops", today=today), 0)

    def test_resets_on_the_first_of_next_month(self):
        self.assertEqual(policy.resets_on(date(2026, 10, 8)), date(2026, 11, 1))
        self.assertEqual(policy.resets_on(date(2026, 12, 31)), date(2027, 1, 1))
```

`ModelCall` may need other required fields: copy the minimal create from `services/copilot/tests/test_usage.py` (`grep -n "ModelCall.objects.create" services/copilot/tests/*.py | head -3`).

- [ ] **Step 2: Run them and watch them fail**

Run: `venv/bin/python manage.py test services.agents --parallel auto --noinput`
Expected: an import error (no `services.agents`).

- [ ] **Step 3: Write `kinds.py`**

```python
"""What every action kind is (Agents round §1.3): its levels, its cap, and
the members each `services.agents.actions` module gives it. The registry
(`registry.py`) collects them; nothing else knows a kind's rules."""

from dataclasses import dataclass
from typing import Callable

from services.metrics.models import AgentAction

AUTO, ASK, NEVER = "auto", "ask", "never"
LEVELS = (AUTO, ASK, NEVER)
#: Lower runs more on its own. A level is allowed when it is at or above a
#: kind's cap: an "ask" cap allows ask and never, not auto.
RANK = {AUTO: 0, ASK: 1, NEVER: 2}
A = AgentAction.Agent
ALL_AGENTS = (A.CS, A.SALES, A.OPS)
RECORD_AGENTS = (A.CS, A.SALES)


class Invalid(Exception):
    """What the model wrote doesn't hold up: dropped at generation."""


class Stale(Exception):
    """The record moved on since the action was proposed: it expires."""


class ChangedSince(Exception):
    """Undo refused: the thing changed after the action applied."""

    def __init__(self, detail, *, current=None, applied=None):
        super().__init__(detail)
        self.detail = detail
        self.current = current
        self.applied = applied


@dataclass(frozen=True)
class Kind:
    key: str
    label: str
    example: str
    max_level: str
    agents: tuple
    #: (payload, row, ctx, evidence) -> clean payload; raises Invalid.
    validate: Callable
    #: payload -> what one open action is kept per.
    target: Callable
    #: action -> the value now (JSON), or None for a kind that makes a thing.
    current: Callable
    #: action -> the contract's `preview` dict.
    preview: Callable
    #: (action, actor, **overrides) -> (after, result); raises Stale.
    apply: Callable
    #: (action, actor) -> None; raises ChangedSince.
    undo: Callable
    workspace_level: bool = False
```

- [ ] **Step 4: Write the models**

`services/agents/models.py`:

```python
"""The agents' own rows (Agents round §1.1, §1.6): one profile per
workspace and agent, and the workspace's Actions & approvals grid. What an
agent did is `metrics.AgentAction`."""

from django.conf import settings
from django.db import models

from services.accounts.models import Organisation
from services.metrics.models import AgentAction


class AgentProfile(models.Model):
    """One agent in one workspace: on or off, its monthly credit budget,
    and how its last pass went (`last_run`: proposed, applied, dropped,
    skipped_reason)."""

    organisation = models.ForeignKey(
        Organisation, related_name="agent_profiles", on_delete=models.CASCADE
    )
    kind = models.CharField(max_length=8, choices=AgentAction.Agent.choices)
    enabled = models.BooleanField(default=True)
    monthly_credits = models.PositiveIntegerField(default=0)
    last_run_at = models.DateTimeField(null=True, blank=True)
    last_run = models.JSONField(default=dict, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "kind"], name="agent_profile_one_per_kind"
            )
        ]

    def __str__(self):
        return f"{self.kind} agent ({self.organisation_id})"


class AgentPolicy(models.Model):
    """The workspace's Actions & approvals grid: `levels` is
    {agent: {kind: "auto"|"ask"|"never"}}; a missing entry reads as ask
    (`policy.level`)."""

    organisation = models.OneToOneField(
        Organisation, related_name="agent_policy", on_delete=models.CASCADE
    )
    levels = models.JSONField(default=dict, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Agent policy ({self.organisation_id})"
```

`services/agents/apps.py`:

```python
from django.apps import AppConfig


class AgentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "services.agents"
```

Copy `default_auto_field` from `services/work/apps.py` so the id type matches.

Run: `venv/bin/python manage.py makemigrations agents --name initial`

- [ ] **Step 5: Write `policy.py`**

```python
"""Each workspace's three agents and its Actions & approvals grid (spec
§1.1, §1.6, §1.7). Profiles and the grid are made the first time anyone
asks, with the defaults: every agent on, every action on ask, and a budget
of a fifth of the plan's monthly credits, split evenly."""

from datetime import date

from django.conf import settings
from django.db import IntegrityError, transaction

from services.metrics.models import AgentAction

from .kinds import ASK, LEVELS, NEVER, RANK
from .models import AgentPolicy, AgentProfile

AGENTS = tuple(AgentAction.Agent.values)
LABELS = dict(AgentAction.Agent.choices)
#: The share of the plan's monthly credits the agents get by default.
SHARE = 0.2


def plan_credits(organisation):
    from services.billing.accounts import ensure

    return ensure(organisation).plan.monthly_credits


def default_budget(organisation):
    return round(plan_credits(organisation) * SHARE / len(AGENTS))


def profiles_for(organisation):
    """{agent: AgentProfile} in cs, sales, ops order, made when missing."""
    found = {p.kind: p for p in AgentProfile.objects.filter(organisation=organisation)}
    missing = [agent for agent in AGENTS if agent not in found]
    if missing:
        budget = default_budget(organisation)
        for agent in missing:
            try:
                with transaction.atomic():
                    found[agent] = AgentProfile.objects.create(
                        organisation=organisation, kind=agent, monthly_credits=budget
                    )
            except IntegrityError:
                # Someone else made it first.
                found[agent] = AgentProfile.objects.get(organisation=organisation, kind=agent)
    return {agent: found[agent] for agent in AGENTS}


def policy_for(organisation):
    found = AgentPolicy.objects.filter(organisation=organisation).first()
    if found is not None:
        return found
    try:
        with transaction.atomic():
            return AgentPolicy.objects.create(organisation=organisation)
    except IntegrityError:
        return AgentPolicy.objects.get(organisation=organisation)


def level(prefs, agent, kind):
    """The level `agent` acts on `kind` at: never for a kind the agent does
    not use, else the stored value (ask when missing), never above the
    kind's cap."""
    from .registry import REGISTRY

    spec = REGISTRY.get(kind)
    if spec is None or agent not in spec.agents:
        return NEVER
    levels = prefs.levels if isinstance(prefs.levels, dict) else {}
    mine = levels.get(agent) if isinstance(levels.get(agent), dict) else {}
    value = mine.get(kind, ASK)
    if value not in LEVELS:
        value = ASK
    if RANK[value] < RANK[spec.max_level]:
        return spec.max_level
    return value


def grid(prefs):
    """{agent: {kind: level}} for the kinds each agent uses, in registry order."""
    from .registry import REGISTRY

    return {
        agent: {
            key: level(prefs, agent, key) for key, spec in REGISTRY.items() if agent in spec.agents
        }
        for agent in AGENTS
    }


def month_start_instant(organisation, today):
    from services.work.clock import start_of_day

    return start_of_day(organisation, today.replace(day=1))


def spent_this_month(organisation, agent, *, today):
    """Credits the agent's calls cost this month: its successful model
    calls since the 1st (the workspace's midnight), as billing charges them
    (Decision 8)."""
    from services.copilot.models import ModelCall

    calls = ModelCall.objects.filter(
        organisation=organisation,
        purpose=f"agent_{agent}",
        outcome=ModelCall.Outcome.OK,
        created_at__gte=month_start_instant(organisation, today),
    ).count()
    return calls * settings.BILLING_CREDITS_PER_MODEL_CALL


def resets_on(today):
    if today.month == 12:
        return date(today.year + 1, 1, 1)
    return date(today.year, today.month + 1, 1)
```

`grid` uses `REGISTRY`, which Task 3 creates. Until then, write `services/agents/registry.py` as a stub that Task 3 replaces:

```python
"""Filled in Task 3."""

REGISTRY = {}
```

With the stub, `test_everything_starts_on_ask` fails. **Mark it `@skip("needs the registry (Task 3)")`, and Task 3 removes the skip.** Every other test passes now.

In `services/copilot/usage.py` `PURPOSES`, after `"proposals"`, add:

```python
    "agent_cs": "CS agent",
    "agent_sales": "Sales agent",
    "agent_ops": "Ops agent",
```

- [ ] **Step 6: Run the tests**

Run: `venv/bin/python manage.py test services.agents services.copilot.tests.test_usage --parallel auto --noinput`
Expected: PASS, with one skip.

- [ ] **Step 7: Commit**

```bash
git add services/agents config/settings.py services/copilot/usage.py
git commit -m "feat(agents): agent profiles, the actions grid and per-agent budgets

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The registry and the record kinds

**Files:**
- Create: `services/agents/evidence.py` (only the `Context` class in this task; Task 5 adds the books)
- Create: `services/agents/actions/__init__.py`, `services/agents/actions/records.py`
- Replace: `services/agents/registry.py`
- Test: `services/agents/tests/test_record_kinds.py`

**Interfaces:**
- Consumes: `kinds.*` (Task 2), `AgentAction` (Task 1).
- Produces:
  - `evidence.Context(organisation, agent, today, records={}, members={}, tasks={}, attributes={}, figures=None)`, with methods `member(pk) -> User|None` and `instance(ref) -> Customer|Account|None`
  - `registry.REGISTRY: dict[str, Kind]`, in the contract's order
  - `registry.kinds_for(agent) -> list[str]`
  - `registry.spec(kind) -> Kind`
  - `actions.records.LIFECYCLE`, `OWNER` and `ATTRIBUTE` (`Kind` objects)

A **row** is one record's evidence dict:

```
{ref, kind ("customer"|"account"), id, name, owner {id, name}|None, lifecycle,
 renewal_date, health, arr, attributes [{id, name, type, options, value}],
 tasks [ids], notes [titles]}
```

- [ ] **Step 1: Write the failing tests**

`services/agents/tests/test_record_kinds.py`:

```python
"""record.lifecycle, record.owner and record.attribute (spec §1.3): each
validates against the evidence, applies through a person's path, and undoes
only while nothing has changed since."""

from services.agents.actions import records
from services.agents.evidence import Context
from services.agents.kinds import ChangedSince, Invalid, Stale
from services.agents.tests.fixtures import AgentsFixture
from services.attributes.models import AIAttribute, AIAttributeValue
from services.metrics.models import AgentAction
from services.notifications.models import Notification


def row_for(record, kind="customer", **extra):
    owner = record.owner
    return {
        "ref": f"{kind}:{record.pk}",
        "kind": kind,
        "id": record.pk,
        "name": record.name,
        "owner": None if owner is None else {"id": owner.pk, "name": owner.name},
        "lifecycle": record.lifecycle_stage,
        "attributes": [],
        "tasks": [],
        **extra,
    }


class RecordKindsTests(AgentsFixture):
    def ctx(self):
        members = {u.pk: {"id": u.pk, "name": u.name} for u in (self.csm, self.mona, self.other)}
        return Context(self.org, "cs", self.today, members=members)

    def action(self, kind, payload, *, record=None, before=None):
        record = record or self.pizza
        return AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind=kind,
            customer=record,
            target=kind,
            title="t",
            rationale="r",
            payload=payload,
            before=before,
        )

    # lifecycle

    def test_lifecycle_validates_the_stage_and_refuses_no_change(self):
        row = row_for(self.pizza)
        self.assertEqual(
            records.LIFECYCLE.validate({"stage": "Renewal"}, row, self.ctx(), []),
            {"stage": "renewal"},
        )
        for bad in ({"stage": "at_risk"}, {"stage": self.pizza.lifecycle_stage}, {}):
            with self.subTest(bad=bad), self.assertRaises(Invalid):
                records.LIFECYCLE.validate(bad, row, self.ctx(), [])

    def test_lifecycle_applies_previews_and_undoes(self):
        start = self.pizza.lifecycle_stage
        action = self.action("record.lifecycle", {"stage": "renewal"}, before=start)
        self.assertEqual(records.LIFECYCLE.current(action), start)
        after, result = records.LIFECYCLE.apply(action, self.mona)
        self.assertEqual((after, result), ("renewal", {}))
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.lifecycle_stage, "renewal")
        action.after = after
        preview = records.LIFECYCLE.preview(action)
        self.assertEqual(preview["field"], "Lifecycle stage")
        self.assertEqual(preview["to"], "Renewal")
        records.LIFECYCLE.undo(action, self.mona)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.lifecycle_stage, start)

    def test_lifecycle_undo_refuses_after_someone_changed_it(self):
        action = self.action("record.lifecycle", {"stage": "renewal"}, before="live")
        action.after, _ = records.LIFECYCLE.apply(action, None)
        type(self.pizza).objects.filter(pk=self.pizza.pk).update(lifecycle_stage="churn")
        with self.assertRaises(ChangedSince) as caught:
            records.LIFECYCLE.undo(action, self.mona)
        self.assertEqual(caught.exception.current, "Churn")
        self.assertEqual(caught.exception.applied, "Renewal")
        self.assertEqual(
            caught.exception.detail, "Lifecycle stage has changed since: it is now Churn."
        )

    # owner

    def test_owner_needs_a_member_who_can_open_the_record(self):
        row = row_for(self.pizza)
        self.assertEqual(
            records.OWNER.validate({"owner_id": self.mona.pk}, row, self.ctx(), []),
            {"owner_id": self.mona.pk},
        )
        for bad in (
            {"owner_id": self.csm.pk},  # no change
            {"owner_id": self.other.pk},  # Dana can't open Pizza Hut
            {"owner_id": self.stranger.pk},  # not in the evidence
            {"owner_id": "2"},
        ):
            with self.subTest(bad=bad), self.assertRaises(Invalid):
                records.OWNER.validate(bad, row, self.ctx(), [])

    def test_owner_applies_through_the_handover_and_tells_the_new_owner(self):
        action = self.action("record.owner", {"owner_id": self.mona.pk}, before=self.csm.pk)
        action.after, _ = records.OWNER.apply(action, self.admin)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.owner_id, self.mona.pk)
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.mona, kind=Notification.Kind.CUSTOMER_ASSIGNED
            ).exists()
        )
        records.OWNER.undo(action, self.admin)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.owner_id, self.csm.pk)

    def test_owner_apply_is_stale_when_the_person_can_no_longer_open_it(self):
        action = self.action("record.owner", {"owner_id": self.other.pk}, before=self.csm.pk)
        with self.assertRaises(Stale):
            records.OWNER.apply(action, self.admin)

    # attribute

    def test_attribute_coerces_and_appends_then_undo_deletes_only_its_own_row(self):
        attribute = AIAttribute.objects.create(
            organisation=self.org,
            name="Renewal likelihood",
            api_name="renewal_likelihood",
            prompt="p",
            value_type=AIAttribute.ValueType.NUMBER,
        )
        ctx = self.ctx()
        ctx.attributes = {
            attribute.pk: {
                "id": attribute.pk,
                "name": attribute.name,
                "type": "number",
                "options": [],
                "applies_to": ("customer",),
            }
        }
        row = row_for(self.pizza, attributes=[{"id": attribute.pk, "value": 40}])
        clean = records.ATTRIBUTE.validate(
            {"attribute_id": attribute.pk, "value": "70%"}, row, ctx, []
        )
        self.assertEqual(clean, {"attribute_id": attribute.pk, "value": 70})
        with self.assertRaises(Invalid):
            records.ATTRIBUTE.validate({"attribute_id": attribute.pk, "value": 40}, row, ctx, [])
        action = self.action("record.attribute", clean)
        action.after, action.result = records.ATTRIBUTE.apply(action, None)
        latest = AIAttributeValue.objects.filter(attribute=attribute, customer=self.pizza).first()
        self.assertEqual((latest.value, latest.origin), (70, "ai"))
        records.ATTRIBUTE.undo(action, self.mona)
        self.assertFalse(AIAttributeValue.objects.filter(attribute=attribute).exists())
        # A newer row wins: undo refuses.
        action.after, action.result = records.ATTRIBUTE.apply(action, None)
        AIAttributeValue.objects.create(
            attribute=attribute, customer=self.pizza, value=10, origin="human"
        )
        with self.assertRaises(ChangedSince):
            records.ATTRIBUTE.undo(action, self.mona)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `venv/bin/python manage.py test services.agents.tests.test_record_kinds --parallel auto --noinput`
Expected: an import error.

- [ ] **Step 3: Write `Context` in `services/agents/evidence.py`**

```python
"""What an agent may know on one pass, indexed for validation (spec §1.2,
Decisions 2 and 3). Task 5 adds the books and the evidence builder."""

from dataclasses import dataclass, field

from services.accounts.models import User
from services.customers.models import Account, Customer


@dataclass
class Context:
    organisation: object
    agent: str
    today: object
    #: ref ("customer:12") -> row
    records: dict = field(default_factory=dict)
    #: user id -> {"id", "name"}
    members: dict = field(default_factory=dict)
    #: task id -> {"id", "record" (ref), "title", "assignee_id", "due_date", "status"}
    tasks: dict = field(default_factory=dict)
    #: attribute id -> {"id", "name", "type", "options", "applies_to"}
    attributes: dict = field(default_factory=dict)
    #: the Ops agent's figures (`metrics.proposals.build_evidence`), else None
    figures: dict | None = None
    _users: dict = field(default_factory=dict, repr=False)
    _instances: dict = field(default_factory=dict, repr=False)

    def member(self, pk):
        """The active member `pk` of the workspace, if the evidence lists them."""
        if pk not in self.members:
            return None
        if pk not in self._users:
            self._users[pk] = User.objects.filter(
                pk=pk, organisation=self.organisation, is_active=True
            ).first()
        return self._users[pk]

    def instance(self, ref):
        if ref not in self._instances:
            kind, _, pk = str(ref).partition(":")
            model = Customer if kind == "customer" else Account
            self._instances[ref] = (
                model.objects.filter(pk=int(pk)).first() if pk.isdigit() else None
            )
        return self._instances[ref]
```

- [ ] **Step 4: Write `services/agents/actions/records.py`**

```python
"""The record kinds (spec §1.3): an organisation's or account's lifecycle
stage, owner, or AI attribute value. Each applies through a person's own
path, and undo restores the old value only while it is still the one the
action set."""

from services.attributes.fill import coerce
from services.attributes.models import AIAttributeValue
from services.customers.models import Customer
from services.customers.scoping import can_open
from services.metrics.models import AgentAction

from ..kinds import ASK, AUTO, RECORD_AGENTS, ChangedSince, Invalid, Kind, Stale

K = AgentAction.Kind
STAGES = dict(Customer.LifecycleStage.choices)


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _parent(record):
    return {"customer": record} if isinstance(record, Customer) else {"account": record}


# record.lifecycle


def _stage(value):
    return STAGES.get(value, str(value))


def lifecycle_validate(payload, row, ctx, evidence):
    stage = str(payload.get("stage") or "").strip().lower()
    if stage not in STAGES:
        raise Invalid(f"unknown stage {stage!r}")
    if stage == row["lifecycle"]:
        raise Invalid("no change")
    return {"stage": stage}


def lifecycle_current(action):
    return action.record.lifecycle_stage


def lifecycle_preview(action):
    return {
        "field": "Lifecycle stage",
        "from": _stage(action.before),
        "to": _stage(action.payload["stage"]),
    }


def lifecycle_apply(action, actor, **_):
    record = action.record
    record.lifecycle_stage = action.payload["stage"]
    record.save(update_fields=["lifecycle_stage", "updated_at"])
    return record.lifecycle_stage, {}


def lifecycle_undo(action, actor):
    record = action.record
    if record.lifecycle_stage != action.after:
        now = _stage(record.lifecycle_stage)
        raise ChangedSince(
            f"Lifecycle stage has changed since: it is now {now}.",
            current=now,
            applied=_stage(action.after),
        )
    record.lifecycle_stage = action.before
    record.save(update_fields=["lifecycle_stage", "updated_at"])


LIFECYCLE = Kind(
    key=K.RECORD_LIFECYCLE,
    label="Change lifecycle stage",
    example="Move Dough Co from Live to Renewal.",
    max_level=AUTO,
    agents=RECORD_AGENTS,
    validate=lifecycle_validate,
    target=lambda payload: "lifecycle",
    current=lifecycle_current,
    preview=lifecycle_preview,
    apply=lifecycle_apply,
    undo=lifecycle_undo,
)


# record.owner


def _name(organisation_id, pk):
    from services.accounts.models import User

    if pk is None:
        return "Nobody"
    found = User.objects.filter(pk=pk, organisation_id=organisation_id).values_list(
        "name", flat=True
    )
    return found.first() or "Someone no longer here"


def _owner_hook(record):
    from services.customers.views import after_account_update, after_customer_update

    return after_customer_update if isinstance(record, Customer) else after_account_update


def owner_validate(payload, row, ctx, evidence):
    owner_id = payload.get("owner_id")
    if not _whole(owner_id) or owner_id not in ctx.members:
        raise Invalid("owner not in the evidence")
    if row["owner"] is not None and row["owner"]["id"] == owner_id:
        raise Invalid("no change")
    # SOC2:AUTH-02 a record is given only to someone who can open it
    if not can_open(ctx.member(owner_id), ctx.instance(row["ref"])):
        raise Invalid("that person can't open this record")
    return {"owner_id": owner_id}


def owner_current(action):
    return action.record.owner_id


def owner_preview(action):
    return {
        "field": "Owner",
        "from": _name(action.organisation_id, action.before),
        "to": _name(action.organisation_id, action.payload["owner_id"]),
    }


def _member(action, pk):
    from services.accounts.models import User

    return User.objects.filter(
        pk=pk, organisation_id=action.organisation_id, is_active=True
    ).first()


def owner_apply(action, actor, **_):
    record = action.record
    new = _member(action, action.payload["owner_id"])
    # SOC2:AUTH-02 checked again when it applies: access may have changed since
    if new is None or not can_open(new, record):
        raise Stale("the new owner can't open this record now")
    previous = record.owner
    record.owner = new
    record.save(update_fields=["owner", "updated_at"])
    _owner_hook(record)(record, actor=actor, previous_owner=previous)
    return new.pk, {}


def owner_undo(action, actor):
    record = action.record
    if record.owner_id != action.after:
        now = _name(action.organisation_id, record.owner_id)
        raise ChangedSince(
            f"Owner has changed since: it is now {now}.",
            current=now,
            applied=_name(action.organisation_id, action.after),
        )
    previous = None if action.before is None else _member(action, action.before)
    # SOC2:AUTH-02 the old owner gets it back only if they can still open it
    if action.before is not None and (previous is None or not can_open(previous, record)):
        raise ChangedSince("The previous owner can't take this record back now.")
    current = record.owner
    record.owner = previous
    record.save(update_fields=["owner", "updated_at"])
    _owner_hook(record)(record, actor=actor, previous_owner=current)


OWNER = Kind(
    key=K.RECORD_OWNER,
    label="Change owner",
    example="Hand Taco East to Dana CSM.",
    max_level=ASK,
    agents=RECORD_AGENTS,
    validate=owner_validate,
    target=lambda payload: "owner",
    current=owner_current,
    preview=owner_preview,
    apply=owner_apply,
    undo=owner_undo,
)


# record.attribute


def _show(value):
    if value is None:
        return "Empty"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    return str(value)


def _latest(action):
    attribute_id = action.payload["attribute_id"]
    return (
        AIAttributeValue.objects.filter(attribute_id=attribute_id, **_parent(action.record))
        .order_by("-computed_at", "-id")
        .first()
    )


def attribute_validate(payload, row, ctx, evidence):
    attribute_id = payload.get("attribute_id")
    spec = ctx.attributes.get(attribute_id) if _whole(attribute_id) else None
    if spec is None or row["kind"] not in spec["applies_to"]:
        raise Invalid("attribute not in the evidence for this record")
    try:
        value = coerce(spec["type"], payload.get("value"), spec["options"])
    except ValueError as exc:
        raise Invalid(str(exc)) from exc
    if value is None:
        raise Invalid("no value")
    current = next((a["value"] for a in row["attributes"] if a["id"] == attribute_id), None)
    if value == current:
        raise Invalid("no change")
    return {"attribute_id": attribute_id, "value": value}


def attribute_current(action):
    latest = _latest(action)
    return None if latest is None else latest.value


def attribute_preview(action):
    from services.attributes.models import AIAttribute

    name = (
        AIAttribute.objects.filter(pk=action.payload["attribute_id"])
        .values_list("name", flat=True)
        .first()
    )
    return {
        "field": name or "AI attribute",
        "from": _show(action.before),
        "to": _show(action.payload["value"]),
    }


def attribute_apply(action, actor, **_):
    row = AIAttributeValue.objects.create(
        attribute_id=action.payload["attribute_id"],
        value=action.payload["value"],
        reasoning=action.rationale,
        origin=AIAttributeValue.Origin.AI,
        status=AIAttributeValue.Status.FILLED,
        set_by=actor,
        **_parent(action.record),
    )
    return row.value, {"value_id": row.pk}


def attribute_undo(action, actor):
    latest = _latest(action)
    if latest is None or latest.pk != (action.result or {}).get("value_id"):
        now = _show(None if latest is None else latest.value)
        name = attribute_preview(action)["field"]
        raise ChangedSince(
            f"{name} has changed since: it is now {now}.",
            current=now,
            applied=_show(action.after),
        )
    latest.delete()


ATTRIBUTE = Kind(
    key=K.RECORD_ATTRIBUTE,
    label="Set an AI attribute",
    example="Set Renewal likelihood on Pizza Hut to 70.",
    max_level=AUTO,
    agents=RECORD_AGENTS,
    validate=attribute_validate,
    target=lambda payload: f"attribute:{payload['attribute_id']}",
    current=attribute_current,
    preview=attribute_preview,
    apply=attribute_apply,
    undo=attribute_undo,
)
```

`services/agents/actions/__init__.py` is empty.

- [ ] **Step 5: Write `registry.py`**

```python
"""Every action kind an agent may take (spec §1.3), in the contract's
order. Task 4 adds the task, note and initiative kinds."""

from .actions import records

REGISTRY = {spec.key: spec for spec in (records.LIFECYCLE, records.OWNER, records.ATTRIBUTE)}


def spec(kind):
    return REGISTRY[kind]


def kinds_for(agent):
    return [key for key, kind in REGISTRY.items() if agent in kind.agents]
```

Remove the `@skip` from `test_everything_starts_on_ask` in `test_policy.py`, but **leave it skipped until Task 4**. Its `"initiative.create"` assertion needs Task 4's kinds. Write a line in your report saying so.

- [ ] **Step 6: Run the tests**

Run: `venv/bin/python manage.py test services.agents --parallel auto --noinput`
Expected: PASS, with the one skip kept.

- [ ] **Step 7: Commit**

```bash
git add services/agents
git commit -m "feat(agents): the action registry and the record kinds (lifecycle, owner, attribute)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The task, note and initiative kinds

**Files:**
- Create: `services/agents/actions/tasks.py`, `services/agents/actions/notes.py`, `services/agents/actions/initiatives.py`
- Modify: `services/agents/registry.py`
- Modify: `services/agents/tests/test_policy.py` (remove the skip)
- Test: `services/agents/tests/test_task_kinds.py`, `services/agents/tests/test_note_initiative_kinds.py`

**Interfaces:**
- Consumes: `Context` and `kinds` (Tasks 2 and 3), and from `services.customers.task_changes`: `add_task`, `snapshot`, `changed_fields`, `record_changes` and `notify_assigned`.
- Produces: `tasks.CREATE`, `REASSIGN`, `REDATE`, `COMPLETE` and `SNOOZE`; `notes.CREATE`; `initiatives.CREATE`. All ten kinds go into `REGISTRY`, in the contract's order.
- `tasks.CREATE.apply(action, actor, *, assignee=None, title=None, due_date=None, priority=None, description="", facts=None, event_data=None)` returns `(task_id, {"task_id": id})`. This is how Work's Assign overrides reach it.

- [ ] **Step 1: Write the failing tests**

`services/agents/tests/test_task_kinds.py`:

```python
"""The task kinds (spec §1.3): create, reassign, redate, complete, snooze.
Plan tasks are never in the evidence; each change writes the task's own
events; undo restores only what is still as the action left it."""

from datetime import timedelta

from services.agents.actions import tasks
from services.agents.evidence import Context
from services.agents.kinds import ChangedSince, Invalid
from services.agents.tests.fixtures import AgentsFixture
from services.agents.tests.test_record_kinds import row_for
from services.customers.models import Task, TaskEvent
from services.metrics.models import AgentAction


class TaskKindsTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.call = Task.objects.create(
            customer=cls.pizza,
            title="Call Pizza Hut",
            assignee=cls.csm,
            assignee_name=cls.csm.name,
            created_by=cls.csm,
            due_date=cls.today + timedelta(days=2),
            priority="high",
        )

    def ctx(self):
        members = {u.pk: {"id": u.pk, "name": u.name} for u in (self.csm, self.mona, self.other)}
        tasks_ = {
            self.call.pk: {
                "id": self.call.pk,
                "record": f"customer:{self.pizza.pk}",
                "title": self.call.title,
                "assignee_id": self.csm.pk,
                "due_date": self.call.due_date.isoformat(),
                "status": "pending",
            }
        }
        return Context(self.org, "cs", self.today, members=members, tasks=tasks_)

    def action(self, kind, payload, *, before=None, evidence=()):
        return AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind=kind,
            customer=self.pizza,
            target=kind,
            title="t",
            rationale="r",
            evidence=list(evidence),
            payload=payload,
            before=before,
        )

    def test_create_validates_and_falls_back_on_bad_people_and_dates(self):
        clean = tasks.CREATE.validate(
            {"title": " Book the QBR ", "assignee_id": self.other.pk, "due_in_days": 400},
            row_for(self.pizza),
            self.ctx(),
            [],
        )
        # Dana can't open Pizza Hut, so nobody is named; the date is capped at 60 days.
        self.assertEqual(clean["title"], "Book the QBR")
        self.assertIsNone(clean["assignee_id"])
        self.assertEqual(clean["due_date"], (self.today + timedelta(days=60)).isoformat())
        self.assertEqual(clean["priority"], "medium")
        with self.assertRaises(Invalid):
            tasks.CREATE.validate({"title": " "}, row_for(self.pizza), self.ctx(), [])

    def test_create_applies_as_an_agent_task_and_undo_removes_an_untouched_one(self):
        action = self.action(
            "task.create",
            {
                "title": "Book the QBR",
                "assignee_id": self.csm.pk,
                "assignee_name": "Carl CSM",
                "due_date": (self.today + timedelta(days=5)).isoformat(),
                "priority": "high",
            },
        )
        action.after, action.result = tasks.CREATE.apply(action, None)
        task = Task.objects.get(pk=action.result["task_id"])
        self.assertEqual((task.source, task.assignee_id), (Task.Source.AGENT, self.csm.pk))
        created = TaskEvent.objects.get(task=task, kind="created")
        self.assertEqual(created.data["agent_action"], action.pk)
        tasks.CREATE.undo(action, self.mona)
        self.assertFalse(Task.objects.filter(pk=task.pk).exists())

    def test_create_undo_refuses_once_someone_worked_on_it(self):
        action = self.action(
            "task.create",
            {
                "title": "Book the QBR",
                "assignee_id": None,
                "assignee_name": "",
                "due_date": self.today.isoformat(),
                "priority": "low",
            },
        )
        action.after, action.result = tasks.CREATE.apply(action, self.mona)
        TaskEvent.objects.create(task_id=action.result["task_id"], kind="comment", body="On it")
        with self.assertRaises(ChangedSince) as caught:
            tasks.CREATE.undo(action, self.mona)
        self.assertEqual(
            caught.exception.detail, "This task has been worked on since: it can't be removed."
        )

    def test_reassign_redate_snooze_and_complete(self):
        reassign = self.action(
            "task.reassign",
            tasks.REASSIGN.validate(
                {"task_id": self.call.pk, "assignee_id": self.mona.pk},
                row_for(self.pizza),
                self.ctx(),
                [],
            ),
            before=self.csm.pk,
        )
        reassign.after, _ = tasks.REASSIGN.apply(reassign, None)
        self.call.refresh_from_db()
        self.assertEqual(self.call.assignee_id, self.mona.pk)
        self.assertTrue(TaskEvent.objects.filter(task=self.call, kind="assigned").exists())
        tasks.REASSIGN.undo(reassign, self.mona)
        self.call.refresh_from_db()
        self.assertEqual(self.call.assignee_id, self.csm.pk)

        until = (self.today + timedelta(days=9)).isoformat()
        snooze = self.action(
            "task.snooze",
            tasks.SNOOZE.validate(
                {"task_id": self.call.pk, "until": until, "reason": "Waiting on legal"},
                row_for(self.pizza),
                self.ctx(),
                [],
            ),
            before=self.call.due_date.isoformat(),
        )
        snooze.after, _ = tasks.SNOOZE.apply(snooze, None)
        self.call.refresh_from_db()
        self.assertEqual(self.call.due_date.isoformat(), until)
        self.assertTrue(
            TaskEvent.objects.filter(
                task=self.call, kind="comment", body="Snoozed by the CS agent: Waiting on legal"
            ).exists()
        )
        self.assertEqual(tasks.SNOOZE.preview(snooze)["to"], f"{until} (snoozed: Waiting on legal)")

        complete = self.action(
            "task.complete",
            tasks.COMPLETE.validate(
                {"task_id": self.call.pk, "because": "Call logged on 6 Oct"},
                row_for(self.pizza),
                self.ctx(),
                ["Call logged on 6 Oct"],
            ),
            before={"status": "pending", "blocked_reason": ""},
            evidence=["Call logged on 6 Oct"],
        )
        complete.after, _ = tasks.COMPLETE.apply(complete, self.mona)
        self.call.refresh_from_db()
        self.assertEqual(self.call.status, "completed")
        tasks.COMPLETE.undo(complete, self.mona)
        self.call.refresh_from_db()
        self.assertEqual(self.call.status, "pending")

    def test_complete_must_quote_its_evidence(self):
        with self.assertRaises(Invalid):
            tasks.COMPLETE.validate(
                {"task_id": self.call.pk, "because": "Trust me"},
                row_for(self.pizza),
                self.ctx(),
                ["Call logged on 6 Oct"],
            )

    def test_a_task_outside_the_evidence_or_on_another_record_is_refused(self):
        for bad in ({"task_id": 999999, "due_date": self.today.isoformat()}, {"task_id": "1"}):
            with self.subTest(bad=bad), self.assertRaises(Invalid):
                tasks.REDATE.validate(bad, row_for(self.pizza), self.ctx(), [])
        with self.assertRaises(Invalid):
            tasks.REDATE.validate(
                {"task_id": self.call.pk, "due_date": self.today.isoformat()},
                row_for(self.dough),
                self.ctx(),
                [],
            )

    def test_redate_undo_refuses_after_someone_moved_it(self):
        new = (self.today + timedelta(days=4)).isoformat()
        action = self.action(
            "task.redate",
            {"task_id": self.call.pk, "due_date": new},
            before=self.call.due_date.isoformat(),
        )
        action.after, _ = tasks.REDATE.apply(action, None)
        Task.objects.filter(pk=self.call.pk).update(due_date=self.today)
        with self.assertRaises(ChangedSince):
            tasks.REDATE.undo(action, self.mona)
```

`services/agents/tests/test_note_initiative_kinds.py`:

```python
"""note.create files a note in the agent's name; initiative.create starts
a decision on a number (Ops only), and undo closes it while nothing hangs
off it."""

from unittest.mock import patch

from services.agents.actions import initiatives, notes
from services.agents.evidence import Context
from services.agents.kinds import ChangedSince, Invalid
from services.agents.tests.fixtures import AgentsFixture
from services.agents.tests.test_record_kinds import row_for
from services.customers.models import Note
from services.metrics.models import AgentAction, Initiative


class NoteTests(AgentsFixture):
    def action(self, payload):
        return AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="note.create",
            customer=self.pizza,
            target="note:x",
            title="t",
            rationale="r",
            payload=payload,
        )

    def test_a_note_in_the_agents_name_and_undo_until_edited(self):
        ctx = Context(self.org, "cs", self.today)
        clean = notes.CREATE.validate(
            {"title": "Renewal call", "body": "Asked for a 2-year term."},
            row_for(self.pizza),
            ctx,
            [],
        )
        action = self.action(clean)
        action.after, action.result = notes.CREATE.apply(action, None)
        note = Note.objects.get(pk=action.result["note_id"])
        self.assertEqual((note.author_id, note.author_name), (None, "CS agent"))
        notes.CREATE.undo(action, self.mona)
        self.assertFalse(Note.objects.filter(pk=note.pk).exists())

        action.after, action.result = notes.CREATE.apply(action, None)
        Note.objects.filter(pk=action.result["note_id"]).update(body="Edited by Carl")
        with self.assertRaises(ChangedSince):
            notes.CREATE.undo(action, self.mona)

    def test_empty_or_long_notes_are_refused(self):
        ctx = Context(self.org, "cs", self.today)
        for bad in ({"title": "", "body": "x"}, {"title": "x", "body": "y" * 4001}):
            with self.subTest(bad=bad), self.assertRaises(Invalid):
                notes.CREATE.validate(bad, row_for(self.pizza), ctx, [])


class InitiativeTests(AgentsFixture):
    def test_starts_and_closes_while_nothing_hangs_off_it(self):
        payload = {
            "metric": "at_risk_arr",
            "metric_label": "ARR at risk",
            "dimension": "",
            "member": "",
            "member_label": "",
            "target_value": 1000.0,
            "target_by": (self.today.replace(day=1)).isoformat(),
        }
        action = AgentAction.objects.create(
            organisation=self.org,
            agent="ops",
            batch="b",
            kind="initiative.create",
            target="initiative:at_risk_arr::",
            title="Halve ARR at risk",
            rationale="r",
            payload=payload,
        )
        with patch("services.metrics.initiatives.Figures") as figures:
            figures.return_value.value_of.return_value = 2000
            action.after, action.result = initiatives.CREATE.apply(action, self.admin)
        initiative = Initiative.objects.get(pk=action.result["initiative_id"])
        self.assertEqual(initiative.status, Initiative.Status.ACTIVE)
        initiatives.CREATE.undo(action, self.admin)
        initiative.refresh_from_db()
        self.assertEqual(initiative.status, Initiative.Status.ABANDONED)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `venv/bin/python manage.py test services.agents --parallel auto --noinput`
Expected: import errors.

- [ ] **Step 3: Write `services/agents/actions/tasks.py`**

```python
"""The task kinds (spec §1.3). A change goes through the task's own write
path (`snapshot` -> save -> `record_changes`), so its events, re-arming and
notices are a person's. Plan tasks never reach the evidence (Decision 3).
`actor` None is the agent acting on its own: events show Revenact."""

from datetime import date, timedelta

from services.accounts.models import User
from services.customers.models import Task, TaskEvent
from services.customers.scoping import can_open
from services.customers.task_changes import (
    add_task,
    changed_fields,
    notify_assigned,
    record_changes,
    snapshot,
)
from services.metrics.models import AgentAction

from ..kinds import ALL_AGENTS, ASK, AUTO, ChangedSince, Invalid, Kind, Stale

K = AgentAction.Kind
PRIORITIES = tuple(Task.Priority.values)
STATUSES = dict(Task.Status.choices)
#: The furthest ahead an agent may move a due date.
MAX_DAYS = 120


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _label(action):
    return AgentAction.Agent(action.agent).label


def _evidence_task(payload, row, ctx):
    task_id = payload.get("task_id")
    task = ctx.tasks.get(task_id) if _whole(task_id) else None
    if task is None or task["record"] != row["ref"]:
        raise Invalid("task not in the evidence for this record")
    return task


def _task(action):
    return (
        Task.objects.select_related("assignee", "customer", "account")
        .filter(pk=action.payload["task_id"])
        .first()
    )


def _change(task, actor, **values):
    """Set `values` on `task` and write its events, as PATCH /tasks/ does."""
    before = snapshot(task)
    for name, value in values.items():
        setattr(task, name, value)
    names = changed_fields(task, before)
    if names:
        task.save(update_fields=[n for n in names if n in ("assignee", "due_date", "status")])
        record_changes(task, before, actor=actor)
    return names


def _date(value, ctx):
    try:
        day = date.fromisoformat(str(value))
    except ValueError as exc:
        raise Invalid("not a date") from exc
    if not ctx.today <= day <= ctx.today + timedelta(days=MAX_DAYS):
        raise Invalid("date out of range")
    return day


def _person(organisation_id, pk):
    return User.objects.filter(pk=pk, organisation_id=organisation_id, is_active=True).first()


def _name_of(organisation_id, pk):
    if pk is None:
        return "Nobody"
    found = User.objects.filter(pk=pk, organisation_id=organisation_id).values_list(
        "name", flat=True
    )
    return found.first() or "Someone no longer here"


def _task_preview(action, field, before, to):
    task = _task(action)
    title = task.title if task is not None else "A removed task"
    return {
        "task": {"id": action.payload["task_id"], "title": title},
        "field": field,
        "from": before,
        "to": to,
    }


# task.create


def create_validate(payload, row, ctx, evidence):
    title = str(payload.get("title") or "").strip()[:255]
    if not title:
        raise Invalid("no title")
    assignee_id = payload.get("assignee_id")
    member = ctx.member(assignee_id) if _whole(assignee_id) else None
    # SOC2:AUTH-02 a task is suggested only for someone who can open its record
    if member is not None and not can_open(member, ctx.instance(row["ref"])):
        member = None
    try:
        due_in = max(1, min(60, int(payload.get("due_in_days", 7))))
    except (TypeError, ValueError):
        due_in = 7
    priority = payload.get("priority") if payload.get("priority") in PRIORITIES else "medium"
    return {
        "title": title,
        "assignee_id": None if member is None else member.pk,
        "assignee_name": "" if member is None else member.name,
        "due_date": (ctx.today + timedelta(days=due_in)).isoformat(),
        "priority": priority,
    }


def _assignee(action, record, actor):
    """The named member if they can still open the record, else (an old
    proposal) the member its name matches, else the record's owner, else
    the person applying it."""
    from services.metrics.proposals import match_member

    payload = action.payload
    member = None
    if _whole(payload.get("assignee_id")):
        member = _person(action.organisation_id, payload["assignee_id"])
    elif payload.get("assignee_name"):
        member = match_member(action.organisation, payload["assignee_name"])
    # SOC2:AUTH-02 a task goes only to someone who can open its record
    if member is not None and can_open(member, record):
        return member
    owner = record.owner
    if owner is not None and can_open(owner, record):
        return owner
    return actor


def create_apply(
    action,
    actor,
    *,
    assignee=None,
    title=None,
    due_date=None,
    priority=None,
    description="",
    facts=None,
    event_data=None,
):
    record = action.record
    if record is None:
        raise Stale("the record no longer exists")
    payload = action.payload
    task = add_task(
        parent=record,
        title=title or payload["title"],
        due_date=due_date or date.fromisoformat(str(payload["due_date"])),
        priority=priority or payload["priority"],
        assignee=assignee if assignee is not None else _assignee(action, record, actor),
        created_by=actor,
        actor=actor,
        source=Task.Source.AGENT,
        description=description,
        facts=facts,
        event_data={"agent_action": action.pk, **(event_data or {})},
        initiative=action.initiative,
    )
    return task.pk, {"task_id": task.pk}


def create_undo(action, actor):
    task = Task.objects.filter(pk=(action.result or {}).get("task_id")).first()
    if task is None:
        return
    untouched = (
        TaskEvent.Kind.CREATED,
        TaskEvent.Kind.RECOMMENDED,
    )
    worked = (
        task.status == Task.Status.COMPLETED
        or TaskEvent.objects.filter(task=task).exclude(kind__in=untouched).exists()
    )
    if worked:
        raise ChangedSince("This task has been worked on since: it can't be removed.")
    task.delete()


def create_preview(action):
    payload = action.payload
    name = payload.get("assignee_name") or ""
    assignee = (
        {"id": payload["assignee_id"], "name": name} if _whole(payload.get("assignee_id")) else None
    )
    return {
        "task": {
            "title": payload["title"],
            "assignee": assignee,
            "due_date": payload["due_date"],
            "priority": payload["priority"],
        }
    }


CREATE = Kind(
    key=K.TASK_CREATE,
    label="Create a task",
    example="Ask Carl CSM to book Dough Co's renewal call by Friday.",
    max_level=AUTO,
    agents=ALL_AGENTS,
    validate=create_validate,
    target=lambda payload: f"task:{payload['title'].casefold()}"[:160],
    current=lambda action: None,
    preview=create_preview,
    apply=create_apply,
    undo=create_undo,
)


# task.reassign


def reassign_validate(payload, row, ctx, evidence):
    task = _evidence_task(payload, row, ctx)
    assignee_id = payload.get("assignee_id")
    member = ctx.member(assignee_id) if _whole(assignee_id) else None
    if member is None or member.pk == task["assignee_id"]:
        raise Invalid("no such person, or no change")
    # SOC2:AUTH-02 a task goes only to someone who can open its record
    if not can_open(member, ctx.instance(row["ref"])):
        raise Invalid("that person can't open this record")
    return {"task_id": task["id"], "assignee_id": member.pk}


def reassign_current(action):
    task = _task(action)
    return None if task is None else task.assignee_id


def reassign_apply(action, actor, **_):
    task = _task(action)
    person = _person(action.organisation_id, action.payload["assignee_id"])
    # SOC2:AUTH-02 checked again when it applies
    if task is None or person is None or not can_open(person, action.record):
        raise Stale("the task or the person changed")
    _change(task, actor, assignee=person)
    notify_assigned(task, actor=actor)
    return person.pk, {}


def reassign_undo(action, actor):
    task = _task(action)
    if task is None or task.assignee_id != action.after:
        now = _name_of(action.organisation_id, None if task is None else task.assignee_id)
        raise ChangedSince(
            f"This task has been reassigned since: it is now {now}'s.",
            current=now,
            applied=_name_of(action.organisation_id, action.after),
        )
    previous = None if action.before is None else _person(action.organisation_id, action.before)
    # SOC2:AUTH-02 the old assignee gets it back only if they can still open it
    if action.before is not None and (previous is None or not can_open(previous, action.record)):
        raise ChangedSince("The previous assignee can't take this task back now.")
    _change(task, actor, assignee=previous)
    if previous is not None:
        notify_assigned(task, actor=actor)


REASSIGN = Kind(
    key=K.TASK_REASSIGN,
    label="Reassign a task",
    example="Give Taco East's onboarding call to Dana CSM.",
    max_level=AUTO,
    agents=ALL_AGENTS,
    validate=reassign_validate,
    target=lambda payload: f"task:{payload['task_id']}:assignee",
    current=reassign_current,
    preview=lambda action: _task_preview(
        action,
        "Assignee",
        _name_of(action.organisation_id, action.before),
        _name_of(action.organisation_id, action.payload["assignee_id"]),
    ),
    apply=reassign_apply,
    undo=reassign_undo,
)


# task.redate and task.snooze share the due date


def _due_current(action):
    task = _task(action)
    return None if task is None else task.due_date.isoformat()


def _due_undo(action, actor):
    task = _task(action)
    if task is None or task.due_date.isoformat() != action.after:
        now = "removed" if task is None else task.due_date.isoformat()
        raise ChangedSince(
            f"This task's due date has changed since: it is now {now}.",
            current=now,
            applied=action.after,
        )
    _change(task, actor, due_date=date.fromisoformat(action.before))


def redate_validate(payload, row, ctx, evidence):
    task = _evidence_task(payload, row, ctx)
    day = _date(payload.get("due_date"), ctx)
    if day.isoformat() == task["due_date"]:
        raise Invalid("no change")
    return {"task_id": task["id"], "due_date": day.isoformat()}


def redate_apply(action, actor, **_):
    task = _task(action)
    if task is None:
        raise Stale("the task is gone")
    _change(task, actor, due_date=date.fromisoformat(action.payload["due_date"]))
    return action.payload["due_date"], {}


REDATE = Kind(
    key=K.TASK_REDATE,
    label="Change a task's due date",
    example="Move Pizza Hut's QBR prep to next Tuesday.",
    max_level=AUTO,
    agents=ALL_AGENTS,
    validate=redate_validate,
    target=lambda payload: f"task:{payload['task_id']}:due",
    current=_due_current,
    preview=lambda action: _task_preview(
        action, "Due date", action.before, action.payload["due_date"]
    ),
    apply=redate_apply,
    undo=_due_undo,
)


def snooze_validate(payload, row, ctx, evidence):
    task = _evidence_task(payload, row, ctx)
    day = _date(payload.get("until"), ctx)
    if day.isoformat() <= task["due_date"]:
        raise Invalid("a snooze moves the date later")
    reason = str(payload.get("reason") or "").strip()[:140]
    if not reason:
        raise Invalid("a snooze says why")
    return {"task_id": task["id"], "until": day.isoformat(), "reason": reason}


def snooze_apply(action, actor, **_):
    task = _task(action)
    if task is None:
        raise Stale("the task is gone")
    _change(task, actor, due_date=date.fromisoformat(action.payload["until"]))
    TaskEvent.objects.create(
        task=task,
        actor=None,
        kind=TaskEvent.Kind.COMMENT,
        body=f"Snoozed by the {_label(action)}: {action.payload['reason']}",
    )
    return action.payload["until"], {}


SNOOZE = Kind(
    key=K.TASK_SNOOZE,
    label="Snooze a task",
    example="Snooze Dough Co's contract chase until the 20th: waiting on legal.",
    max_level=AUTO,
    agents=ALL_AGENTS,
    validate=snooze_validate,
    target=lambda payload: f"task:{payload['task_id']}:due",
    current=_due_current,
    preview=lambda action: _task_preview(
        action,
        "Due date",
        action.before,
        f"{action.payload['until']} (snoozed: {action.payload['reason']})",
    ),
    apply=snooze_apply,
    undo=_due_undo,
)


# task.complete


def complete_validate(payload, row, ctx, evidence):
    task = _evidence_task(payload, row, ctx)
    because = str(payload.get("because") or "").strip()
    if because not in evidence:
        raise Invalid("a completion must quote its evidence")
    return {"task_id": task["id"], "because": because}


def complete_current(action):
    task = _task(action)
    return None if task is None else {"status": task.status, "blocked_reason": task.blocked_reason}


def complete_apply(action, actor, **_):
    task = _task(action)
    if task is None:
        raise Stale("the task is gone")
    _change(task, actor, status=Task.Status.COMPLETED)
    return Task.Status.COMPLETED, {}


def complete_undo(action, actor):
    task = _task(action)
    if task is None or task.status != Task.Status.COMPLETED:
        raise ChangedSince("This task has been reopened since.")
    before = action.before or {}
    task.blocked_reason = before.get("blocked_reason", "")
    _change(task, actor, status=before.get("status", Task.Status.PENDING))


COMPLETE = Kind(
    key=K.TASK_COMPLETE,
    label="Mark a task done",
    example="Close 'Send the deck' on Pizza Hut: the deck was emailed on 6 Oct.",
    max_level=ASK,
    agents=ALL_AGENTS,
    validate=complete_validate,
    target=lambda payload: f"task:{payload['task_id']}:status",
    current=complete_current,
    preview=lambda action: _task_preview(
        action,
        "Status",
        STATUSES.get((action.before or {}).get("status"), "Open"),
        "Completed",
    ),
    apply=complete_apply,
    undo=complete_undo,
)
```

`complete_undo` must restore a Blocked status *with* its reason. If `Task.save` clears the reason before the check constraint passes, set `task.status` and `task.blocked_reason` together and call `_change(task, actor, status=..., blocked_reason=...)`. `changed_fields` already includes `blocked_reason`, but it is not in `_change`'s `update_fields` filter, so add it there.

- [ ] **Step 4: Write `notes.py` and `initiatives.py`**

`services/agents/actions/notes.py`:

```python
"""note.create (spec §1.3): a note on the record, in the agent's name
(Decision 16). Undo deletes it while it is as the agent wrote it."""

from django.utils import timezone

from services.customers.models import Customer, Note
from services.metrics.models import AgentAction

from ..kinds import ALL_AGENTS, AUTO, ChangedSince, Invalid, Kind, Stale

BODY_LIMIT = 4000


def validate(payload, row, ctx, evidence):
    title = str(payload.get("title") or "").strip()[:255]
    body = str(payload.get("body") or "").strip()
    if not title or not body or len(body) > BODY_LIMIT:
        raise Invalid("a note needs a title and a body under 4000 characters")
    return {"title": title, "body": body}


def apply(action, actor, **_):
    record = action.record
    if record is None:
        raise Stale("the record no longer exists")
    parent = {"customer": record} if isinstance(record, Customer) else {"account": record}
    note = Note.objects.create(
        **parent,
        title=action.payload["title"],
        body=action.payload["body"],
        author=None,
        author_name=AgentAction.Agent(action.agent).label,
        logged_at=timezone.localdate(),
    )
    return note.pk, {"note_id": note.pk}


def undo(action, actor):
    note = Note.objects.filter(pk=(action.result or {}).get("note_id")).first()
    if note is None:
        return
    if note.title != action.payload["title"] or note.body != action.payload["body"]:
        raise ChangedSince("This note has been edited since.")
    note.delete()


CREATE = Kind(
    key=AgentAction.Kind.NOTE_CREATE,
    label="File a note",
    example="File a note on Taco Bell: two urgent tickets about invoicing this week.",
    max_level=AUTO,
    agents=ALL_AGENTS,
    validate=validate,
    target=lambda payload: f"note:{payload['title'].casefold()}"[:160],
    current=lambda action: None,
    preview=lambda action: {"note": {"title": action.payload["title"]}},
    apply=apply,
    undo=undo,
)
```

`services/agents/actions/initiatives.py`:

```python
"""initiative.create (spec §1.3): the Ops agent's decision on a number,
validated exactly as the old proposals were. Undo closes it while no work
hangs off it."""

from django.utils import timezone

from services.metrics import initiatives as initiative_rules
from services.metrics.models import AgentAction, Initiative

from ..kinds import ASK, ChangedSince, Invalid, Kind


def validate(payload, row, ctx, evidence):
    from services.metrics.proposals import _validate

    if row is not None or ctx.figures is None:
        raise Invalid("an initiative is workspace-level and needs the figures")
    item = {"kind": "initiative", "title": "initiative", "action": payload}
    action = _validate(ctx.organisation, ctx.figures, item)
    if action is None:
        raise Invalid("the initiative names something outside the figures")
    return action


def apply(action, actor, **_):
    payload = action.payload
    initiative = initiative_rules.create_initiative(
        action.organisation,
        actor,
        title=action.title,
        hypothesis=action.rationale,
        metric=payload["metric"],
        dimension=payload["dimension"],
        member=payload["member"],
        member_label=payload["member_label"],
        target_value=initiative_rules.as_decimal(payload["target_value"]),
        target_by=payload["target_by"],
    )
    return initiative.pk, {"initiative_id": initiative.pk}


def undo(action, actor):
    initiative = Initiative.objects.filter(pk=(action.result or {}).get("initiative_id")).first()
    if initiative is None:
        return
    linked = (
        initiative.tasks.exists()
        or AgentAction.objects.filter(initiative=initiative).exclude(pk=action.pk).exists()
    )
    if linked:
        raise ChangedSince("Work is linked to this initiative now.")
    initiative.status = Initiative.Status.ABANDONED
    initiative.closed_at = timezone.now()
    initiative.save(update_fields=["status", "closed_at"])


def preview(action):
    payload = action.payload
    label = payload.get("metric_label") or payload.get("metric")
    return {
        "initiative": {
            "metric": label,
            "target": f"{payload.get('target_value')} by {payload.get('target_by')}",
        }
    }


CREATE = Kind(
    key=AgentAction.Kind.INITIATIVE_CREATE,
    label="Start an initiative",
    example="Start 'Halve ARR at risk on Product B' by the end of the quarter.",
    max_level=ASK,
    agents=(AgentAction.Agent.OPS,),
    validate=validate,
    target=lambda payload: (
        f"initiative:{payload['metric']}:{payload['dimension']}:{payload['member']}"
    )[:160],
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    workspace_level=True,
)
```

If `Initiative` has no `updated_at` and `save` needs more fields, follow `closed_at_after` in `services/metrics/initiatives.py`.

- [ ] **Step 5: Complete the registry**

```python
"""Every action kind an agent may take (spec §1.3), in the contract's
order."""

from .actions import initiatives, notes, records, tasks

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
        initiatives.CREATE,
    )
}


def spec(kind):
    return REGISTRY[kind]


def kinds_for(agent):
    return [key for key, kind in REGISTRY.items() if agent in kind.agents]
```

Remove the `@skip` in `test_policy.py`. Add a test there:

```python
    def test_the_registry_is_the_contracts_table(self):
        from services.agents.registry import REGISTRY

        self.assertEqual(
            [(k.key, k.max_level, tuple(k.agents)) for k in REGISTRY.values()],
            [
                ("record.lifecycle", "auto", ("cs", "sales")),
                ("record.owner", "ask", ("cs", "sales")),
                ("record.attribute", "auto", ("cs", "sales")),
                ("task.create", "auto", ("cs", "sales", "ops")),
                ("task.reassign", "auto", ("cs", "sales", "ops")),
                ("task.redate", "auto", ("cs", "sales", "ops")),
                ("task.complete", "ask", ("cs", "sales", "ops")),
                ("task.snooze", "auto", ("cs", "sales", "ops")),
                ("note.create", "auto", ("cs", "sales", "ops")),
                ("initiative.create", "ask", ("ops",)),
            ],
        )
```

- [ ] **Step 6: Run the tests**

Run: `venv/bin/python manage.py test services.agents --parallel auto --noinput`
Expected: PASS with no skips.

- [ ] **Step 7: Commit**

```bash
git add services/agents
git commit -m "feat(agents): task, note and initiative kinds

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Books, evidence and the prompt

**Files:**
- Modify: `services/agents/evidence.py` (add the books and `build`)
- Create: `services/agents/prompt.py`
- Test: `services/agents/tests/test_evidence.py`

**Interfaces:**
- Consumes: `REGISTRY` and `kinds_for` (Task 4); `proposals.build_evidence`, `build_prompt`, `_parse` and `NothingToProposeFrom` (Task 1).
- Produces:
  - `evidence.book(organisation, agent) -> (customers_qs, accounts_qs)`
  - `evidence.build(organisation, agent, *, today) -> Context`
  - `evidence.RECORD_LIMIT = 15`
  - `prompt.system(agent, allowed, tone) -> str`
  - `prompt.render(ctx) -> str`
  - `prompt.parse(raw) -> list[dict]`
  - `prompt.MAX_ACTIONS = 8`

- [ ] **Step 1: Write the failing tests**

`services/agents/tests/test_evidence.py`:

```python
"""Each agent's book (Decision 2) and what it is shown (Decision 3)."""

from datetime import timedelta

from services.accounts.models import User
from services.agents import evidence, prompt
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import Note, Task
from services.plans.models import Plan


class BookTests(AgentsFixture):
    def names(self, agent):
        customers, accounts = evidence.book(self.org, agent)
        return (
            sorted(customers.values_list("name", flat=True)),
            sorted(accounts.values_list("name", flat=True)),
        )

    def test_cs_reads_records_cs_people_own(self):
        self.assertEqual(
            self.names("cs"),
            (
                ["Dough Co", "Pizza Hut", "Soup Co", "Taco Bell"],
                ["Pizza EMEA", "Taco East", "Taco West"],
            ),
        )

    def test_sales_reads_records_sales_people_own(self):
        self.assertEqual(self.names("sales"), (["Deals Ltd"], []))

    def test_ops_reads_the_whole_workspace(self):
        customers, _ = self.names("ops")
        self.assertIn("Loose Ltd", customers)
        self.assertNotIn("Globex Corp", customers)

    def test_a_deactivated_owners_records_leave_the_function_book(self):
        User.objects.filter(pk=self.sam.pk).update(is_active=False)
        self.assertEqual(self.names("sales"), ([], []))


class EvidenceTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.open_task = Task.objects.create(
            customer=cls.pizza,
            title="Call Pizza Hut",
            assignee=cls.csm,
            assignee_name=cls.csm.name,
            due_date=cls.today + timedelta(days=2),
            priority="high",
        )
        cls.done = Task.objects.create(
            customer=cls.pizza,
            title="Old call",
            assignee=cls.csm,
            assignee_name=cls.csm.name,
            due_date=cls.today,
            priority="low",
            status="completed",
        )
        Note.objects.create(
            customer=cls.pizza,
            title="Kickoff",
            body="x",
            author_name="Carl",
            logged_at=cls.today,
        )

    def test_rows_carry_owner_lifecycle_open_tasks_and_note_titles(self):
        ctx = evidence.build(self.org, "cs", today=self.today)
        row = ctx.records[f"customer:{self.pizza.pk}"]
        self.assertEqual(row["owner"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(row["notes"], ["Kickoff"])
        self.assertEqual(row["tasks"], [self.open_task.pk])
        self.assertIn(self.open_task.pk, ctx.tasks)
        self.assertNotIn(self.done.pk, ctx.tasks)
        self.assertIn(self.mona.pk, ctx.members)
        self.assertIsNone(ctx.figures)

    def test_plan_tasks_are_left_out(self):
        plan = Plan.objects.create(
            organisation=self.org, customer=self.pizza, name="Save play", owner=self.csm
        )
        Task.objects.filter(pk=self.open_task.pk).update(plan=plan)
        ctx = evidence.build(self.org, "cs", today=self.today)
        self.assertNotIn(self.open_task.pk, ctx.tasks)

    def test_the_prompt_names_refs_ids_and_only_allowed_kinds(self):
        ctx = evidence.build(self.org, "cs", today=self.today)
        text = prompt.render(ctx)
        self.assertIn(f"customer:{self.pizza.pk}", text)
        self.assertIn(f"task {self.open_task.pk}", text)
        system = prompt.system("cs", ["record.lifecycle", "note.create"], "concise")
        self.assertIn("record.lifecycle", system)
        self.assertNotIn("task.create", system)
        self.assertIn("at most 8", system)
        self.assertIn("concise", system)

    def test_parse_reads_an_array_and_drops_non_objects(self):
        self.assertEqual(
            prompt.parse('Here: [{"kind": "note.create"}, 3]'), [{"kind": "note.create"}]
        )
```

`Plan.objects.create` needs whatever fields `services/plans/models.py` requires. Copy the minimal create from `services/plans/tests` (`grep -rn "Plan.objects.create" services/plans/tests | head -3`).

- [ ] **Step 2: Run them and watch them fail**

Run: `venv/bin/python manage.py test services.agents.tests.test_evidence --parallel auto --noinput`
Expected: `AttributeError: module 'services.agents.evidence' has no attribute 'book'`.

- [ ] **Step 3: Add the books and `build` to `evidence.py`**

Append:

```python
from django.db.models import F, Q

from services.attributes.models import AIAttribute, AIAttributeValue
from services.customers.models import Note, Task
from services.customers.scoping import SystemActor, live_customers

#: Most records one agent is shown (Decision 2).
RECORD_LIMIT = 15
TASKS_PER_RECORD = 5
NOTES_PER_RECORD = 3
FUNCTION = {"cs": User.Function.CS, "sales": User.Function.SALES}


def book(organisation, agent):
    """(organisations, accounts) the agent looks at: the function's own
    people's for CS and Sales, the whole workspace for Ops. `id IN`
    subqueries, never a join made unique with DISTINCT."""
    # SOC2:AUTH-02 a scheduled job reads as the workspace itself, never as a person
    customers = live_customers(SystemActor(organisation))
    linked = Account.customers.through.objects.filter(
        customer_id__in=customers.values("id")
    ).values("account_id")
    accounts = Account.objects.filter(id__in=linked)
    function = FUNCTION.get(agent)
    if function is not None:
        mine = Q(owner__function=function, owner__is_active=True)
        customers = customers.filter(mine)
        accounts = accounts.filter(mine)
    return customers, accounts


def _ordered(queryset):
    return queryset.select_related("owner").order_by(F("renewal_date").asc(nulls_last=True), "id")


def _row(record, kind):
    owner = record.owner
    return {
        "ref": f"{kind}:{record.pk}",
        "kind": kind,
        "id": record.pk,
        "name": record.name,
        "owner": None if owner is None else {"id": owner.pk, "name": owner.name},
        "lifecycle": record.lifecycle_stage,
        "renewal_date": None if record.renewal_date is None else record.renewal_date.isoformat(),
        "health": record.health_category,
        "arr": float(record.arr_billed_at_account) if kind == "customer" else None,
        "attributes": [],
        "tasks": [],
        "notes": [],
    }


def build(organisation, agent, *, today):
    """Everything the agent may know on this pass, as a Context."""
    ctx = Context(organisation, agent, today)
    customers, accounts = book(organisation, agent)
    picked = list(_ordered(customers)[:RECORD_LIMIT])
    room = RECORD_LIMIT - len(picked)
    picked_accounts = list(_ordered(accounts)[:room]) if room > 0 else []
    for record in picked:
        row = _row(record, "customer")
        ctx.records[row["ref"]] = row
    for record in picked_accounts:
        row = _row(record, "account")
        ctx.records[row["ref"]] = row
    customer_ids = [r.pk for r in picked]
    account_ids = [r.pk for r in picked_accounts]

    ctx.members = {
        u.pk: {"id": u.pk, "name": u.name}
        for u in User.objects.filter(organisation=organisation, is_active=True).order_by("name")
    }
    _attributes(ctx, customer_ids, account_ids)
    _tasks(ctx, customer_ids, account_ids)
    _notes(ctx, customer_ids, account_ids)
    if agent == "ops":
        from services.metrics.proposals import NothingToProposeFrom, build_evidence

        try:
            ctx.figures = build_evidence(organisation)
        except NothingToProposeFrom:
            ctx.figures = None
    return ctx


def _ref(kind, pk):
    return f"{kind}:{pk}"


def _attributes(ctx, customer_ids, account_ids):
    attributes = AIAttribute.objects.filter(organisation=ctx.organisation)
    for attribute in attributes:
        applies = tuple(
            kind
            for kind, flag in (
                ("customer", attribute.applies_to_customer),
                ("account", attribute.applies_to_account),
            )
            if flag
        )
        ctx.attributes[attribute.pk] = {
            "id": attribute.pk,
            "name": attribute.name,
            "type": attribute.value_type,
            "options": list(attribute.picklist_options or []),
            "applies_to": applies,
        }
    seen = set()
    values = AIAttributeValue.objects.filter(
        Q(customer_id__in=customer_ids) | Q(account_id__in=account_ids),
        attribute__organisation=ctx.organisation,
    ).order_by("-computed_at", "-id")
    for value in values:
        ref = (
            _ref("customer", value.customer_id)
            if value.customer_id
            else _ref("account", value.account_id)
        )
        if (ref, value.attribute_id) in seen or ref not in ctx.records:
            continue
        seen.add((ref, value.attribute_id))
        ctx.records[ref]["attributes"].append(
            {
                "id": value.attribute_id,
                "name": ctx.attributes[value.attribute_id]["name"],
                "value": value.value,
            }
        )


def _tasks(ctx, customer_ids, account_ids):
    rows = (
        Task.objects.filter(Q(customer_id__in=customer_ids) | Q(account_id__in=account_ids))
        .filter(plan__isnull=True)
        .exclude(status=Task.Status.COMPLETED)
        .select_related("assignee")
        .order_by("due_date", "id")
    )
    for task in rows:
        ref = (
            _ref("customer", task.customer_id)
            if task.customer_id
            else _ref("account", task.account_id)
        )
        row = ctx.records.get(ref)
        if row is None or len(row["tasks"]) >= TASKS_PER_RECORD:
            continue
        row["tasks"].append(task.pk)
        ctx.tasks[task.pk] = {
            "id": task.pk,
            "record": ref,
            "title": task.title,
            "assignee_id": task.assignee_id,
            "assignee": None if task.assignee is None else task.assignee.name,
            "due_date": task.due_date.isoformat(),
            "status": task.status,
        }


def _notes(ctx, customer_ids, account_ids):
    rows = Note.objects.filter(
        Q(customer_id__in=customer_ids) | Q(account_id__in=account_ids)
    ).order_by("-logged_at", "-id")
    for note in rows.only("id", "title", "customer_id", "account_id"):
        ref = (
            _ref("customer", note.customer_id)
            if note.customer_id
            else _ref("account", note.account_id)
        )
        row = ctx.records.get(ref)
        if row is not None and len(row["notes"]) < NOTES_PER_RECORD:
            row["notes"].append(note.title)
```

Move these imports to the top of the module alongside the existing ones. Ruff's import sorting will order them.

- [ ] **Step 4: Write `prompt.py`**

```python
"""What one agent is asked (Decision 14): a system prompt naming only the
kinds it may use and their payloads, and the evidence as plain lines with
refs and ids it must quote back."""

from services.metrics.models import AgentAction
from services.metrics.proposals import _parse, build_prompt

MAX_ACTIONS = 8

PAYLOADS = {
    "record.lifecycle": '{"stage": one of onboarding|kickoff|adoption|live|renewal|churn|'
    "expansion|other}",
    "record.owner": '{"owner_id": <a member id>}',
    "record.attribute": '{"attribute_id": <an attribute id>, "value": <a value of its type>}',
    "task.create": '{"title": <task title>, "assignee_id": <member id or null>, '
    '"due_in_days": <1-60>, "priority": "high"|"medium"|"low"}',
    "task.reassign": '{"task_id": <an open task id on the record>, "assignee_id": <member id>}',
    "task.redate": '{"task_id": <task id>, "due_date": "YYYY-MM-DD"}',
    "task.complete": '{"task_id": <task id>, "because": <one of this action\'s evidence lines>}',
    "task.snooze": '{"task_id": <task id>, "until": "YYYY-MM-DD", "reason": <why, short>}',
    "note.create": '{"title": <short title>, "body": <what you found, plain sentences>}',
    "initiative.create": '{"metric": <metric key>, "dimension": <a cut or "">, "member": '
    '<member id from that cut or "">, "target_value": <number>, "target_in_days": <14-180>}',
}

SYSTEM = """You are the {label} inside a customer platform. You work for the \
people who own these records and act only inside the product: you never \
send anything to a customer.

Propose at most {limit} actions as a JSON array and nothing else. Each is an \
object with:
  "kind": one of {kinds}.
  "record": the ref of the record it acts on, as given ("customer:12", \
"account:7"), or null for initiative.create.
  "title": a specific imperative sentence, at most 80 characters.
  "rationale": 1-3 sentences saying why, quoting the figures you rely on.
  "evidence": an array of 1-4 short strings, each quoted from the input.
  "payload": the kind's own object:
{payloads}

Rules:
- Use only the refs, ids, names and values given. Anything else is discarded.
- At most one action per record and field.
- Prefer proposing nothing over guessing.
- Write in a {tone} tone.
"""


def system(agent, allowed, tone):
    label = AgentAction.Agent(agent).label
    payloads = "\n".join(f"  - {kind}: {PAYLOADS[kind]}" for kind in allowed)
    return SYSTEM.format(
        label=label,
        limit=MAX_ACTIONS,
        kinds=", ".join(allowed),
        payloads=payloads,
        tone=tone,
    )


def render(ctx):
    lines = [f"Today is {ctx.today.isoformat()}."]
    lines.append("\nRECORDS (ref: name):")
    if not ctx.records:
        lines.append("- none")
    for row in ctx.records.values():
        owner = row["owner"]["name"] if row["owner"] else "nobody"
        renewal = row["renewal_date"] or "no renewal date"
        arr = f", ARR {row['arr']:,.0f}" if row["arr"] is not None else ""
        lines.append(
            f"- {row['ref']}: {row['name']}, owner {owner}, lifecycle {row['lifecycle']}, "
            f"renews {renewal}, health {row['health']}{arr}"
        )
        for attribute in row["attributes"]:
            lines.append(
                f"    attribute {attribute['id']} {attribute['name']} = {attribute['value']}"
            )
        for task_id in row["tasks"]:
            task = ctx.tasks[task_id]
            lines.append(
                f"    task {task_id}: {task['title']}, assigned to {task['assignee'] or 'nobody'},"
                f" due {task['due_date']}, {task['status']}"
            )
        for title in row["notes"]:
            lines.append(f"    note: {title}")
    lines.append("\nATTRIBUTES (id: name, type, options):")
    for attribute in ctx.attributes.values():
        options = ", ".join(map(str, attribute["options"])) or "-"
        lines.append(f"- {attribute['id']}: {attribute['name']}, {attribute['type']}, {options}")
    lines.append("\nMEMBERS (id: name):")
    lines.extend(f"- {m['id']}: {m['name']}" for m in ctx.members.values())
    if ctx.figures is not None:
        lines.append("\nWORKSPACE FIGURES:")
        lines.append(build_prompt(ctx.figures))
    return "\n".join(lines)


def parse(raw):
    return _parse(raw)
```

- [ ] **Step 5: Run the tests**

Run: `venv/bin/python manage.py test services.agents --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/agents
git commit -m "feat(agents): books, evidence and the prompt for each agent

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Deciding — approve, reject, expiry and `apply_action`

The pass in Task 7 reuses `apply_action` for Auto, so deciding comes first.

**Files:**
- Create: `services/agents/deciding.py`
- Modify: `services/work/recommend.py` (`settle_for_proposal` → `settle_for_action`, which also handles expired)
- Modify: `services/metrics/proposals.py` (`approve` and `reject` delegate to `agents.deciding`)
- Test: `services/agents/tests/test_deciding.py`

**Interfaces:**
- Consumes: `REGISTRY`, `Stale` and `ChangedSince`; `policy.level`; `feedback.record_proposal_decision`.
- Produces:
  - roles `OWNER`, `CHAIN`, `COMPANY`
  - `decided_as(reader, action) -> str | None`
  - exceptions `AlreadyDecided(action)`, `Expired(action)`, `CantDecide()`
  - `REASONS` (`expired_reason -> sentence`)
  - `stale_reason(action, now, prefs=None) -> str | None`
  - `expire(action, reason)`
  - `apply_action(action, actor, *, auto=False, note="", **overrides) -> action`
  - `approve(reader, pk, *, note="", **overrides) -> (action, role)`
  - `reject(reader, pk, *, note="") -> (action, role)`
  - `locked(pk) -> action`
  - `WAIT = timedelta(days=14)`
  - `work.recommend.settle_for_action(action, user)`

- [ ] **Step 1: Write the failing tests**

`services/agents/tests/test_deciding.py`:

```python
"""Deciding an agent action (spec §1.4): who may, under a lock, once;
a stale or waited action expires instead of applying."""

from datetime import timedelta

from django.utils import timezone

from services.agents import deciding
from services.agents.models import AgentPolicy
from services.agents.policy import policy_for
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import Customer
from services.metrics.models import AgentAction, Feedback


class DecidingTests(AgentsFixture):
    def lifecycle(self, record=None, **fields):
        record = record or self.pizza
        return AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="record.lifecycle",
            customer=record,
            target="lifecycle",
            title="Move to renewal",
            rationale="r",
            payload={"stage": "renewal"},
            before=record.lifecycle_stage,
            **fields,
        )

    def test_who_may_decide(self):
        action = self.lifecycle()
        self.assertEqual(deciding.decided_as(self.csm, action), deciding.OWNER)
        self.assertEqual(deciding.decided_as(self.mona, action), deciding.CHAIN)
        self.assertEqual(deciding.decided_as(self.admin, action), deciding.COMPANY)
        self.assertIsNone(deciding.decided_as(self.other, action))
        self.assertIsNone(deciding.decided_as(self.lee, action))

    def test_a_workspace_level_action_is_view_all_only(self):
        action = AgentAction.objects.create(
            organisation=self.org,
            agent="ops",
            batch="b",
            kind="initiative.create",
            target="initiative:nrr::",
            title="t",
            rationale="r",
            payload={},
        )
        self.assertEqual(deciding.decided_as(self.admin, action), deciding.COMPANY)
        self.assertIsNone(deciding.decided_as(self.csm, action))

    def test_approve_applies_once_and_records_feedback(self):
        action = self.lifecycle()
        applied, role = deciding.approve(self.csm, action.pk, note="Yes")
        self.assertEqual((applied.status, role), ("applied", deciding.OWNER))
        self.assertEqual(applied.decided_by, self.csm)
        self.assertFalse(applied.auto)
        self.assertEqual(applied.after, "renewal")
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.lifecycle_stage, "renewal")
        self.assertTrue(Feedback.objects.filter(subject_id=action.pk).exists())
        with self.assertRaises(deciding.AlreadyDecided):
            deciding.approve(self.mona, action.pk)

    def test_reject(self):
        action = self.lifecycle()
        rejected, _ = deciding.reject(self.mona, action.pk, note="Not yet")
        self.assertEqual((rejected.status, rejected.decision_note), ("rejected", "Not yet"))
        self.pizza.refresh_from_db()
        self.assertNotEqual(self.pizza.lifecycle_stage, "renewal")

    def test_cant_decide(self):
        action = self.lifecycle()
        with self.assertRaises(deciding.CantDecide):
            deciding.approve(self.other, action.pk)

    def test_a_record_that_moved_on_expires_the_action(self):
        action = self.lifecycle()
        Customer.objects.filter(pk=self.pizza.pk).update(lifecycle_stage="churn")
        with self.assertRaises(deciding.Expired) as caught:
            deciding.approve(self.csm, action.pk)
        self.assertEqual(caught.exception.action.expired_reason, "changed")
        self.assertEqual(AgentAction.objects.get(pk=action.pk).status, "expired")

    def test_an_action_waiting_14_days_expires(self):
        action = self.lifecycle()
        AgentAction.objects.filter(pk=action.pk).update(
            created_at=timezone.now() - timedelta(days=15)
        )
        with self.assertRaises(deciding.Expired) as caught:
            deciding.approve(self.csm, action.pk)
        self.assertEqual(caught.exception.action.expired_reason, "waited")

    def test_a_kind_set_to_never_expires_on_decision(self):
        action = self.lifecycle()
        AgentPolicy.objects.filter(pk=policy_for(self.org).pk).update(
            levels={"cs": {"record.lifecycle": "never"}}
        )
        with self.assertRaises(deciding.Expired) as caught:
            deciding.approve(self.csm, action.pk)
        self.assertEqual(caught.exception.action.expired_reason, "never")

    def test_auto_apply_has_no_decider(self):
        action = self.lifecycle()
        deciding.apply_action(action, None, auto=True)
        action.refresh_from_db()
        self.assertEqual((action.status, action.auto, action.decided_by), ("applied", True, None))
        self.assertFalse(Feedback.objects.filter(subject_id=action.pk).exists())
```

Add a race test, modelled on `services/work/tests/test_deciding_race.py` (two connections, two threads; the first decider wins):

```python
    # in services/agents/tests/test_deciding_race.py, a TransactionTestCase
    # copying that file's thread-and-barrier pattern: two approvals of one
    # action at once -> exactly one "applied", the other AlreadyDecided.
```

Write it in full by copying `test_deciding_race.py`'s structure. Replace its `deciding.assign` calls with `services.agents.deciding.approve(user, pk)` and assert `AgentAction.objects.get(pk=pk).status == "applied"`, with exactly one `AlreadyDecided` among the outcomes.

- [ ] **Step 2: Run them and watch them fail**

Run: `venv/bin/python manage.py test services.agents.tests.test_deciding --parallel auto --noinput`
Expected: an import error.

- [ ] **Step 3: Write `deciding.py`**

```python
"""Deciding an agent action (spec §1.4, Decisions 4, 7 and 10). Who may:
the record's owner, anyone above them, or view_all_accounts; a
workspace-level action, view_all only. Each decision runs under the action's
row lock and re-reads its status there, so the first decider wins. An
action whose record moved on, that waited 14 days, or whose kind is now
Never expires instead of applying."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound

from core import audit
from services.accounts.hierarchy import subtree_ids
from services.customers.scoping import sees_everything
from services.metrics import feedback as feedback_log
from services.metrics.models import AgentAction

from .kinds import NEVER, Stale
from .policy import level, policy_for
from .registry import REGISTRY

S = AgentAction.Status
OWNER, CHAIN, COMPANY = "owner", "chain", "company"
WAIT = timedelta(days=14)
NO_SUCH_ACTION = "No such action."
#: expired_reason -> the contract's sentence
REASONS = {
    "changed": "the record changed since",
    "not_reproposed": "the agent no longer proposes it",
    "replaced": "the agent no longer proposes it",
    "never": "this action is now set to never",
    "waited": "it waited 14 days",
}


class AlreadyDecided(Exception):
    def __init__(self, action):
        super().__init__(action.status)
        self.action = action


class Expired(Exception):
    def __init__(self, action):
        super().__init__(action.expired_reason)
        self.action = action


class CantDecide(Exception):
    """The reader may not decide this action."""


def decided_as(reader, action):
    """How `reader` may decide or undo `action`, or None."""
    # SOC2:AUTH-02 an action on a record: its owner, anyone above them, or
    # view_all_accounts; a workspace-level action: view_all_accounts only
    if not REGISTRY[action.kind].workspace_level:
        record = action.record
        owner_id = None if record is None else record.owner_id
        if owner_id is not None:
            if owner_id == reader.pk:
                return OWNER
            if owner_id in subtree_ids(reader):
                return CHAIN
    if sees_everything(reader):
        return COMPANY
    return None


def locked(pk):
    action = (
        AgentAction.objects.select_for_update(of=("self",))
        .select_related("customer", "account", "organisation")
        .filter(pk=pk)
        .first()
    )
    if action is None:
        raise NotFound(NO_SUCH_ACTION)
    return action


def stale_reason(action, now, prefs=None):
    """Why a proposed action can no longer apply, or None (Decision 4)."""
    if action.created_at <= now - WAIT:
        return "waited"
    prefs = prefs or policy_for(action.organisation)
    if level(prefs, action.agent, action.kind) == NEVER:
        return "never"
    if action.kind != AgentAction.Kind.INITIATIVE_CREATE and action.record is None:
        return "changed"
    if REGISTRY[action.kind].current(action) != action.before:
        return "changed"
    return None


def expire(action, reason):
    action.status = S.EXPIRED
    action.expired_reason = reason
    action.save(update_fields=["status", "expired_reason"])
    _settle(action, None)


def _settle(action, user):
    from services.work.recommend import settle_for_action

    settle_for_action(action, user)


def apply_action(action, actor, *, auto=False, note="", **overrides):
    """Apply a proposed action through its kind, record what it set, and
    settle its recommendation. Raises Stale (from the kind) untouched."""
    spec = REGISTRY[action.kind]
    after, result = spec.apply(action, actor, **overrides)
    now = timezone.now()
    action.after = after
    action.result = result
    action.status = S.APPLIED
    action.auto = auto
    action.applied_at = now
    action.decided_at = now
    action.decided_by = None if auto else actor
    action.decision_note = note
    action.save(
        update_fields=[
            "after",
            "result",
            "status",
            "auto",
            "applied_at",
            "decided_at",
            "decided_by",
            "decision_note",
        ]
    )
    audit.record(  # SOC2:LOG-01
        "agent_action.applied",
        actor=actor,
        organisation=action.organisation,
        target=action,
        metadata={"kind": action.kind, "agent": action.agent, "auto": auto},
    )
    if not auto:
        feedback_log.record_proposal_decision(action, "approved", note, actor)
    _settle(action, actor)
    return action


def _decide(reader, pk, run):
    """Lock, check, and `run(action, role)`; an expiry is kept and raised
    after the lock is released."""
    expired = None
    with transaction.atomic():
        action = locked(pk)
        if action.organisation_id != reader.organisation_id:
            raise NotFound(NO_SUCH_ACTION)
        if action.status != S.PROPOSED:
            raise AlreadyDecided(action)
        role = decided_as(reader, action)
        if role is None:
            raise CantDecide()
        reason = stale_reason(action, timezone.now())
        if reason is not None:
            expire(action, reason)
            expired = action
        else:
            try:
                return run(action, role), role
            except Stale:
                expire(action, "changed")
                expired = action
    raise Expired(expired)


def approve(reader, pk, *, note="", **overrides):
    return _decide(
        reader, pk, lambda action, role: apply_action(action, reader, note=note, **overrides)
    )


def reject(reader, pk, *, note=""):
    def run(action, role):
        action.status = S.REJECTED
        action.decided_by = reader
        action.decided_at = timezone.now()
        action.decision_note = note
        action.save(update_fields=["status", "decided_by", "decided_at", "decision_note"])
        audit.record(  # SOC2:LOG-01
            "agent_action.rejected",
            actor=reader,
            target=action,
            metadata={"kind": action.kind, "agent": action.agent},
        )
        feedback_log.record_proposal_decision(action, "rejected", note, reader)
        _settle(action, reader)
        return action

    return _decide(reader, pk, run)
```

An `apply` that raises inside the atomic block must not leave half-written rows. Wrap `run(...)` in its own `transaction.atomic()` savepoint before catching `Stale`:

```python
            try:
                with transaction.atomic():
                    result = run(action, role)
                return result, role
            except Stale:
                ...
```

Use this form.

- [ ] **Step 4: Settle recommendations, and route the old approve through here**

In `services/work/recommend.py`, rename `settle_for_proposal` to `settle_for_action`:

```python
def settle_for_action(action, user):
    """An agent action decided anywhere settles its open recommendation the
    same way, so Brain's Waiting on you and Work's Recommended never
    disagree: applied -> assigned (with the task it made), rejected ->
    dismissed as "other" with the note, expired -> expired. Called with the
    action's row locked; the recommendation's row is locked second."""
    from services.metrics.models import AgentAction

    AS = AgentAction.Status
    with transaction.atomic():
        rec = (
            Recommendation.objects.select_for_update()
            .filter(proposal=action, status=S.OPEN)
            .order_by("-id")
            .first()
        )
        if rec is None:
            return None
        rec.decided_by = user
        rec.decided_at = action.decided_at or timezone.now()
        if action.status == AS.APPLIED:
            rec.status = S.ASSIGNED
            rec.task_id = (action.result or {}).get("task_id")
        elif action.status == AS.EXPIRED:
            rec.status = S.EXPIRED
        else:
            rec.status = S.DISMISSED
            rec.dismiss_reason = Recommendation.DismissReason.OTHER
            rec.dismiss_note = (action.decision_note or "Rejected in Brain")[:255]
        rec.save(
            update_fields=[
                "status",
                "decided_by",
                "decided_at",
                "task",
                "dismiss_reason",
                "dismiss_note",
            ]
        )
        return rec
```

Keep the field name `proposal` until Task 10. Update `work/deciding.py._settled`, which reads `settle_for_proposal`.

In `services/metrics/proposals.py`:
- Delete the body of `approve`, `_settle` and `reject`.
- Keep thin delegates for the old callers (`work/deciding.py`, the legacy decision view) until Task 10 and Task 11 move them:

```python
def approve(proposal, user, note="", **overrides):
    """Old callers: apply through services.agents (the lock is the caller's)."""
    from services.agents.deciding import apply_action

    if proposal.status != AgentAction.Status.PROPOSED:
        raise AlreadyDecided(f"This proposal was already {proposal.get_status_display().lower()}.")
    if "assignee" in overrides and overrides["assignee"] is None:
        overrides.pop("assignee")
    return apply_action(proposal, user, note=note, **overrides)


def reject(proposal, user, note=""):
    from django.utils import timezone

    from services.agents.deciding import _settle

    if proposal.status != AgentAction.Status.PROPOSED:
        raise AlreadyDecided(f"This proposal was already {proposal.get_status_display().lower()}.")
    proposal.status = AgentAction.Status.REJECTED
    proposal.decided_by = user
    proposal.decided_at = timezone.now()
    proposal.decision_note = note
    proposal.save(update_fields=["status", "decided_by", "decided_at", "decision_note"])
    feedback_log.record_proposal_decision(proposal, "rejected", note, user)
    _settle(proposal, user)
    return proposal
```

`work/deciding.py._assign` passes `assignee`, `title`, `due_date`, `priority`, `description`, `facts` and `event_data`. `tasks.CREATE.apply` takes exactly those.

- [ ] **Step 5: Run the tests**

Run: `venv/bin/python manage.py test services.agents services.work services.brain services.metrics --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/agents services/work/recommend.py services/work/deciding.py services/metrics/proposals.py
git commit -m "feat(agents): deciding agent actions under a lock; expiry instead of stale applies

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The nightly pass and Run now's engine

**Files:**
- Create: `services/agents/run.py`
- Modify: `services/work/recommend.py` (`refresh(..., kinds=None)`)
- Modify: `services/customers/management/commands/run_health_maintenance.py`
- Test: `services/agents/tests/test_run.py`

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces:
  - `run.RunResult(proposed=0, applied=0, dropped=0, skipped_reason=None, failed=[])`, with `as_dict()`
  - `run.run(organisation, agent, *, now=None, actor=None) -> RunResult`
  - `run.run_all(organisation=None, *, now=None) -> RunResult`
  - `run.skip_reason(organisation, profile, prefs, today) -> str | None`
  - `recommend.refresh(organisation, *, today, now=None, actor=None, kinds=None)`

- [ ] **Step 1: Write the failing tests**

`services/agents/tests/test_run.py`:

```python
"""One pass of one agent (spec §1.2, Decisions 4–9): skip reasons, one
model call, the drop rules, Auto versus Ask, re-proposal, budgets, and
isolation between agents and workspaces."""

import json
from unittest.mock import patch

from services.accounts.models import Organisation
from services.agents import run
from services.agents.models import AgentPolicy, AgentProfile
from services.agents.policy import policy_for, profiles_for
from services.agents.tests.fixtures import AgentsFixture
from services.copilot.anthropic_client import CopilotRequestFailed
from services.customers.models import Customer
from services.metrics.models import AgentAction

PATH = "services.agents.run.get_completion"


def answer(*items):
    return json.dumps(list(items))


class RunTests(AgentsFixture):
    def setUp(self):
        with patch("services.agents.policy.plan_credits", return_value=3000):
            profiles_for(self.org)

    def org_now(self):
        return Organisation.objects.get(pk=self.org.pk)

    def lifecycle(self, record=None, stage="renewal", ref=None):
        record = record or self.pizza
        return {
            "kind": "record.lifecycle",
            "record": ref or f"customer:{record.pk}",
            "title": f"Move {record.name} to {stage}",
            "rationale": "Renews soon.",
            "evidence": ["Renews in 30 days"],
            "payload": {"stage": stage},
        }

    def pass_(self, *items, agent="cs"):
        with patch(PATH, return_value=answer(*items)) as call:
            result = run.run(self.org_now(), agent)
        return result, call

    def test_ask_creates_proposed_actions_with_their_basis(self):
        result, call = self.pass_(self.lifecycle())
        self.assertEqual((result.proposed, result.applied, result.dropped), (1, 0, 0))
        action = AgentAction.objects.get(kind="record.lifecycle")
        self.assertEqual(
            (action.status, action.agent, action.customer_id),
            ("proposed", "cs", self.pizza.pk),
        )
        self.assertEqual(action.before, self.pizza.lifecycle_stage)
        self.assertEqual(call.call_args.kwargs["purpose"], "agent_cs")
        profile = AgentProfile.objects.get(organisation=self.org, kind="cs")
        self.assertEqual(profile.last_run["proposed"], 1)

    def test_auto_applies_at_once(self):
        AgentPolicy.objects.filter(pk=policy_for(self.org).pk).update(
            levels={"cs": {"record.lifecycle": "auto"}}
        )
        result, _ = self.pass_(self.lifecycle())
        self.assertEqual(result.applied, 1)
        action = AgentAction.objects.get(kind="record.lifecycle")
        self.assertEqual((action.status, action.auto), ("applied", True))
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.lifecycle_stage, "renewal")

    def test_the_drop_rules(self):
        result, _ = self.pass_(
            self.lifecycle(ref="customer:999999"),  # not in the evidence
            self.lifecycle(record=self.deals),  # a Sales record: not in the CS book
            {**self.lifecycle(), "kind": "initiative.create"},  # not a CS kind
            self.lifecycle(stage="nonsense"),  # validate refuses
            self.lifecycle(),
            self.lifecycle(),  # a duplicate in the same answer
        )
        self.assertEqual((result.proposed, result.dropped), (1, 5))

    def test_never_kinds_are_neither_offered_nor_kept(self):
        AgentPolicy.objects.filter(pk=policy_for(self.org).pk).update(
            levels={"cs": {"record.lifecycle": "never"}}
        )
        result, call = self.pass_(self.lifecycle())
        self.assertEqual((result.proposed, result.dropped), (0, 1))
        self.assertNotIn("record.lifecycle", call.call_args.kwargs["system"].split("Rules:")[0])

    def test_reproposing_keeps_one_open_action_and_a_change_replaces_it(self):
        self.pass_(self.lifecycle())
        self.pass_(self.lifecycle())
        self.assertEqual(AgentAction.objects.filter(status="proposed").count(), 1)
        self.pass_(self.lifecycle(stage="expansion"))
        old, new = AgentAction.objects.order_by("id")
        self.assertEqual((old.status, old.expired_reason), ("expired", "replaced"))
        self.assertEqual((new.status, new.payload), ("proposed", {"stage": "expansion"}))

    def test_an_action_the_next_pass_drops_expires(self):
        self.pass_(self.lifecycle())
        self.pass_()
        action = AgentAction.objects.get()
        self.assertEqual((action.status, action.expired_reason), ("expired", "not_reproposed"))

    def test_a_rejected_action_is_not_reproposed_for_14_days(self):
        self.pass_(self.lifecycle())
        AgentAction.objects.update(status="rejected")
        result, _ = self.pass_(self.lifecycle())
        self.assertEqual((result.proposed, result.dropped), (0, 1))

    def test_skip_reasons(self):
        Organisation.objects.filter(pk=self.org.pk).update(ai_agent_enabled=False)
        result, call = self.pass_(self.lifecycle())
        self.assertEqual(result.skipped_reason, "ai_off")
        call.assert_not_called()
        Organisation.objects.filter(pk=self.org.pk).update(ai_agent_enabled=True)

        AgentProfile.objects.filter(organisation=self.org, kind="cs").update(enabled=False)
        self.assertEqual(self.pass_()[0].skipped_reason, "disabled")
        AgentProfile.objects.filter(organisation=self.org, kind="cs").update(
            enabled=True, monthly_credits=0
        )
        self.assertEqual(self.pass_()[0].skipped_reason, "budget")

    def test_a_failed_call_is_reported_and_expires_nothing(self):
        self.pass_(self.lifecycle())
        with patch(PATH, side_effect=CopilotRequestFailed("down")):
            result = run.run(self.org_now(), "cs")
        self.assertEqual(result.skipped_reason, "failed")
        self.assertEqual(AgentAction.objects.get().status, "proposed")

    def test_run_all_keeps_going_when_one_agent_fails(self):
        real = run.run

        def flaky(organisation, agent, **kwargs):
            if agent == "cs":
                raise RuntimeError("Pizza Hut")
            return run.RunResult()

        with patch.object(run, "run", side_effect=flaky):
            result = run.run_all(self.org_now())
        self.assertIn(f"cs in organisation {self.org.pk}", result.failed)
        self.assertIs(run.run, real)

    def test_suspended_workspaces_are_skipped(self):
        Organisation.objects.filter(pk=self.org.pk).update(status=Organisation.Status.SUSPENDED)
        with patch.object(run, "run") as each:
            run.run_all()
        self.assertNotIn(self.org.pk, [c.args[0].pk for c in each.call_args_list])

    def test_the_customer_of_an_account_action_is_its_first_organisation(self):
        result, _ = self.pass_(self.lifecycle(record=self.emea, ref=f"account:{self.emea.pk}"))
        self.assertEqual(result.proposed, 1)
        action = AgentAction.objects.get()
        self.assertEqual((action.account_id, action.customer_id), (self.emea.pk, None))

    def test_records_gone_since_are_ignored(self):
        Customer.objects.filter(pk=self.dough.pk).update(is_archived=True)
        result, _ = self.pass_(self.lifecycle(record=self.dough))
        self.assertEqual((result.proposed, result.dropped), (0, 1))
```

Fix the account test's name: an account action stores only `account` (Decision 5's key covers both FKs), so rename the test to `test_an_account_action_stores_the_account`.

- [ ] **Step 2: Run them and watch them fail**

Run: `venv/bin/python manage.py test services.agents.tests.test_run --parallel auto --noinput`
Expected: an import error.

- [ ] **Step 3: Write `run.py`**

```python
"""One agent's pass over its book (spec §1.2). Skip, build the evidence,
make one model call, keep what survives the drop rules (Decision 6), apply
Auto at once and leave Ask proposed, expire what a successful pass no longer
proposes (Decision 4). Each agent and each workspace fails on its own."""

import logging
import uuid
from dataclasses import dataclass, field

from django.db import IntegrityError, transaction
from django.utils import timezone

from services.accounts.models import Organisation
from services.copilot.anthropic_client import (
    BudgetExceeded,
    CopilotNotConfigured,
    CopilotRequestFailed,
    get_completion,
)
from services.metrics.models import AgentAction

from . import evidence as evidence_
from . import prompt
from .deciding import WAIT, apply_action, expire, stale_reason
from .kinds import AUTO, NEVER, Invalid, Stale
from .policy import AGENTS, level, policy_for, profiles_for, spent_this_month
from .registry import REGISTRY, kinds_for

logger = logging.getLogger(__name__)
S = AgentAction.Status
OUTPUT_TOKENS = 3000


@dataclass
class RunResult:
    proposed: int = 0
    applied: int = 0
    dropped: int = 0
    skipped_reason: str | None = None
    failed: list = field(default_factory=list)

    def as_dict(self):
        return {
            "proposed": self.proposed,
            "applied": self.applied,
            "dropped": self.dropped,
            "skipped_reason": self.skipped_reason,
        }

    def add(self, other):
        self.proposed += other.proposed
        self.applied += other.applied
        self.dropped += other.dropped


def skip_reason(organisation, profile, prefs, today):
    if not organisation.ai_agent_enabled:
        return "ai_off"
    if not profile.enabled:
        return "disabled"
    if all(level(prefs, profile.kind, kind) == NEVER for kind in kinds_for(profile.kind)):
        return "no_actions"
    if spent_this_month(organisation, profile.kind, today=today) >= profile.monthly_credits:
        return "budget"
    return None


def _finish(profile, result, now):
    profile.last_run_at = now
    profile.last_run = result.as_dict()
    profile.save(update_fields=["last_run_at", "last_run", "updated_at"])
    return result


def _record_fields(ctx, item, spec):
    """{customer|account: instance} for the item's ref, or {} for a
    workspace-level kind; raises Invalid when they don't agree."""
    ref = item.get("record")
    if spec.workspace_level:
        if ref not in (None, "", "null"):
            raise Invalid("a workspace-level kind takes no record")
        return None, {}
    row = ctx.records.get(ref)
    if row is None:
        raise Invalid("record not in the evidence")
    instance = ctx.instance(ref)
    if instance is None:
        raise Invalid("record gone")
    return row, {row["kind"]: instance}


def _open_twin(organisation, kind, fields, target):
    return (
        AgentAction.objects.filter(
            organisation=organisation,
            kind=kind,
            status=S.PROPOSED,
            customer=fields.get("customer"),
            account=fields.get("account"),
            target=target,
        )
        .select_for_update()
        .first()
    )


def _recently_refused(organisation, kind, fields, target, payload, now):
    return AgentAction.objects.filter(
        organisation=organisation,
        kind=kind,
        customer=fields.get("customer"),
        account=fields.get("account"),
        target=target,
        status__in=[S.REJECTED, S.UNDONE],
        created_at__gte=now - WAIT,
        payload=payload,
    ).exists()


def _consider(organisation, agent, item, ctx, prefs, batch, now, actor, kept, result):
    """One item of the answer: dropped, kept as an existing twin, proposed,
    or applied."""
    kind = str(item.get("kind") or "")
    spec = REGISTRY.get(kind)
    if spec is None or level(prefs, agent, kind) == NEVER:
        raise Invalid("kind not allowed")
    row, fields = _record_fields(ctx, item, spec)
    evidence = [str(e) for e in (item.get("evidence") or []) if isinstance(e, str)][:4]
    payload = spec.validate(
        item.get("payload") if isinstance(item.get("payload"), dict) else {},
        row,
        ctx,
        evidence,
    )
    target = spec.target(payload)
    if (kind, row and row["ref"], target) in kept["keys"]:
        raise Invalid("duplicate in this answer")
    with transaction.atomic():
        twin = _open_twin(organisation, kind, fields, target)
        if twin is not None and twin.payload == payload:
            kept["keys"].add((kind, row and row["ref"], target))
            kept["ids"].add(twin.pk)
            raise Invalid("already open")
        if _recently_refused(organisation, kind, fields, target, payload, now):
            raise Invalid("refused recently")
        if twin is not None:
            expire(twin, "replaced")
        action = AgentAction(
            organisation=organisation,
            agent=agent,
            batch=batch,
            kind=kind,
            target=target,
            title=str(item.get("title") or spec.label).strip()[:255],
            rationale=str(item.get("rationale") or "").strip(),
            evidence=evidence,
            payload=payload,
            generated_by=actor,
            **fields,
        )
        action.before = spec.current(action)
        action.save()
    kept["keys"].add((kind, row and row["ref"], target))
    kept["ids"].add(action.pk)
    if level(prefs, agent, kind) == AUTO and stale_reason(action, now, prefs) is None:
        try:
            with transaction.atomic():
                apply_action(action, None, auto=True)
            result.applied += 1
            return
        except Stale:
            # Decision 7: it stays proposed for a person.
            pass
    result.proposed += 1


def run(organisation, agent, *, now=None, actor=None):
    """One pass of `agent` over `organisation`. See the module."""
    from services.work.clock import today_for

    now = now or timezone.now()
    today = today_for(organisation, now)
    profile = profiles_for(organisation)[agent]
    prefs = policy_for(organisation)
    result = RunResult()
    reason = skip_reason(organisation, profile, prefs, today)
    if reason is not None:
        result.skipped_reason = reason
        return _finish(profile, result, now)
    allowed = [kind for kind in kinds_for(agent) if level(prefs, agent, kind) != NEVER]
    ctx = evidence_.build(organisation, agent, today=today)
    try:
        raw = get_completion(
            system=prompt.system(agent, allowed, organisation.ai_agent_tone),
            messages=[{"role": "user", "content": prompt.render(ctx)}],
            max_tokens=OUTPUT_TOKENS,
            purpose=f"agent_{agent}",
            organisation=organisation,
            user=actor,
        )
        items = prompt.parse(raw)
    except BudgetExceeded:
        result.skipped_reason = "credits"
        return _finish(profile, result, now)
    except (CopilotNotConfigured, CopilotRequestFailed, ValueError):
        result.skipped_reason = "failed"
        return _finish(profile, result, now)
    batch = uuid.uuid4().hex
    kept = {"keys": set(), "ids": set()}
    for item in items[: prompt.MAX_ACTIONS] + items[prompt.MAX_ACTIONS :]:
        if len(kept["keys"]) >= prompt.MAX_ACTIONS:
            result.dropped += 1
            continue
        try:
            _consider(organisation, agent, item, ctx, prefs, batch, now, actor, kept, result)
        except (Invalid, IntegrityError, KeyError, TypeError) as exc:
            logger.info("agent %s dropped an action: %s", agent, type(exc).__name__)
            result.dropped += 1
    _expire_unproposed(organisation, agent, kept["ids"], now)
    return _finish(profile, result, now)


def _expire_unproposed(organisation, agent, kept_ids, now):
    """Decision 4: a successful pass expires its agent's earlier proposals it
    did not propose again (not the facilitator's, not migrated ones), and
    anything that has waited 14 days."""
    waiting = AgentAction.objects.filter(organisation=organisation, agent=agent, status=S.PROPOSED)
    for action in waiting.filter(created_at__lte=now - WAIT):
        expire(action, "waited")
    unproposed = (
        waiting.filter(session__isnull=True)
        .exclude(target__startswith="legacy:")
        .exclude(pk__in=kept_ids)
    )
    for action in unproposed:
        expire(action, "not_reproposed")


def run_all(organisation=None, *, now=None):
    """Every active workspace with organisations (or just `organisation`),
    every agent, each on its own."""
    from services.customers.models import Customer

    if organisation is not None:
        workspaces = [organisation]
    else:
        workspaces = Organisation.objects.filter(
            status=Organisation.Status.ACTIVE,
            id__in=Customer.objects.values("organisation_id"),
        ).order_by("id")
    total = RunResult()
    for workspace in workspaces:
        for agent in AGENTS:
            try:
                total.add(run(workspace, agent, now=now))
            except Exception as exc:  # noqa: BLE001 - reported, never fatal
                logger.warning(
                    "agents: %s in organisation %s failed: %s",
                    agent,
                    workspace.pk,
                    type(exc).__name__,
                )
                total.failed.append(f"{agent} in organisation {workspace.pk}")
    return total
```

Simplify the item loop to `for item in items:` with the same cap check. The slice expression above is redundant.

`run_all` must call `run` through the module global so that `patch.object(run, "run", ...)` works. Calling the bare name `run(...)` inside the module does that.

- [ ] **Step 4: Wire it in**

In `services/work/recommend.py`, give `refresh` a `kinds=None` parameter. It loops `for kind in (kinds or K.values):`, and the other sources' results are unchanged when `kinds` is given.

In `run_health_maintenance.py`, immediately **before** the `# Recommended work:` block, add:

```python
        # Agents: each function's agent reads its book and proposes, or on
        # Auto applies, actions before Recommended routes them tonight
        # (services.agents.run; spec Decision 9). Never fatal.
        if not options["dry_run"]:
            from services.agents import run as agents_run

            try:
                night = agents_run.run_all(organisation)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"agents proposed {night.proposed} action(s); applied {night.applied}"
                    )
                )
                for failure in night.failed:
                    self.stdout.write(self.style.WARNING(f"agent pass failed: {failure}"))
            except Exception as exc:  # noqa: BLE001 - reported, never fatal
                # the class name only: an exception's text can quote a row's values
                self.stdout.write(self.style.WARNING(f"agents skipped: {type(exc).__name__}"))
```

Add a test to `test_run.py`:

```python
class NightlyCommandTests(AgentsFixture):
    def test_run_health_maintenance_runs_the_agents(self):
        from io import StringIO

        from django.core.management import call_command

        out = StringIO()
        with (
            patch(PATH, return_value="[]"),
            patch("services.agents.policy.plan_credits", return_value=3000),
        ):
            call_command("run_health_maintenance", stdout=out)
        self.assertIn("agents proposed 0 action(s); applied 0", out.getvalue())
```

- [ ] **Step 5: Run the tests**

Run: `venv/bin/python manage.py test services.agents services.work services.customers.tests --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/agents services/work/recommend.py services/customers/management/commands/run_health_maintenance.py
git commit -m "feat(agents): the nightly pass: one call per agent, drop rules, auto vs ask, expiry

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Undo and its notice

**Files:**
- Create: `services/agents/undo.py`
- Modify: `services/notifications/models.py` (add the `AGENT_ACTION_UNDONE` kind and update the docstring)
- Create: `services/notifications/migrations/0010_agent_action_undone.py` (generated)
- Test: `services/agents/tests/test_undo.py`

**Interfaces:**
- Consumes: from deciding: `locked`, `decided_as`, `AlreadyDecided`, `CantDecide`.
- Produces:
  - `undo.UNDO_DAYS = 7`
  - `undo.NotApplied`
  - `undo.UndoExpired`
  - `undo.undo(reader, pk) -> action`, which raises the three above, `ChangedSince` or `AlreadyDecided`
  - `undo.undo_window(action) -> datetime | None`
  - `Notification.Kind.AGENT_ACTION_UNDONE = "agent_action_undone"`

- [ ] **Step 1: Write the failing tests**

`services/agents/tests/test_undo.py`:

```python
"""Undo (spec §1.5): for 7 days, by anyone who could have approved it,
refused when the thing changed since; the approver (or the record owner for
Auto) is told."""

from datetime import timedelta

from django.utils import timezone

from services.agents import deciding, undo
from services.agents.kinds import ChangedSince
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import Customer
from services.metrics.models import AgentAction
from services.notifications.models import Notification

K = Notification.Kind


class UndoTests(AgentsFixture):
    def applied(self, *, auto=False, decider=None):
        action = AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="record.lifecycle",
            customer=self.pizza,
            target="lifecycle",
            title="t",
            rationale="r",
            payload={"stage": "renewal"},
            before=self.pizza.lifecycle_stage,
        )
        return deciding.apply_action(action, decider, auto=auto)

    def test_undo_restores_and_tells_the_approver(self):
        action = self.applied(decider=self.mona)
        undone = undo.undo(self.csm, action.pk)
        self.assertEqual((undone.status, undone.undone_by), ("undone", self.csm))
        self.pizza.refresh_from_db()
        self.assertNotEqual(self.pizza.lifecycle_stage, "renewal")
        note = Notification.objects.get(kind=K.AGENT_ACTION_UNDONE)
        self.assertEqual(note.recipient, self.mona)
        self.assertEqual(
            note.message, "Carl CSM undid the CS agent's lifecycle change on Pizza Hut."
        )
        self.assertEqual(note.link, f"/work/activity?action={action.pk}")

    def test_auto_undo_tells_the_record_owner_and_not_the_undoer(self):
        action = self.applied(auto=True)
        undo.undo(self.mona, action.pk)
        self.assertEqual(
            list(
                Notification.objects.filter(kind=K.AGENT_ACTION_UNDONE).values_list(
                    "recipient", flat=True
                )
            ),
            [self.csm.pk],
        )
        action2 = self.applied(auto=True)
        undo.undo(self.csm, action2.pk)
        self.assertEqual(Notification.objects.filter(kind=K.AGENT_ACTION_UNDONE).count(), 1)

    def test_refusals_in_order(self):
        action = self.applied(decider=self.mona)
        with self.assertRaises(deciding.CantDecide):
            undo.undo(self.other, action.pk)
        AgentAction.objects.filter(pk=action.pk).update(
            applied_at=timezone.now() - timedelta(days=8)
        )
        with self.assertRaises(undo.UndoExpired):
            undo.undo(self.csm, action.pk)
        AgentAction.objects.filter(pk=action.pk).update(applied_at=timezone.now())
        Customer.objects.filter(pk=self.pizza.pk).update(lifecycle_stage="churn")
        with self.assertRaises(ChangedSince):
            undo.undo(self.csm, action.pk)
        Customer.objects.filter(pk=self.pizza.pk).update(lifecycle_stage="renewal")
        undo.undo(self.csm, action.pk)
        with self.assertRaises(deciding.AlreadyDecided):
            undo.undo(self.mona, action.pk)

    def test_only_an_applied_action_can_be_undone(self):
        action = AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="record.lifecycle",
            customer=self.pizza,
            target="lifecycle",
            title="t",
            rationale="r",
            payload={"stage": "renewal"},
        )
        with self.assertRaises(undo.NotApplied):
            undo.undo(self.csm, action.pk)

    def test_the_notice_is_generic_for_someone_who_cant_open_the_record(self):
        action = self.applied(decider=self.other)
        undo.undo(self.csm, action.pk)
        note = Notification.objects.get(kind=K.AGENT_ACTION_UNDONE)
        self.assertEqual(
            note.message, "Carl CSM undid an agent action on an organisation you can't open."
        )
```

A real Dana could never approve Pizza Hut. `apply_action` records the decider without checking, which is why this test can set her up as the approver to exercise the generic message.

- [ ] **Step 2: Run them and watch them fail**

Run: `venv/bin/python manage.py test services.agents.tests.test_undo --parallel auto --noinput`
Expected: an import error.

- [ ] **Step 3: Add the notification kind**

In `Notification.Kind`, after `TASK_ESCALATED`:

```python
        AGENT_ACTION_UNDONE = "agent_action_undone", "Agent action undone"
```

Extend the docstring: "an agent action someone undid (`agent_action_undone`, services/agents/undo.py)". Then run `venv/bin/python manage.py makemigrations notifications --name agent_action_undone`.

- [ ] **Step 4: Write `undo.py`**

```python
"""Undo (spec §1.5): an applied action, for 7 days, by anyone who could
have approved it. The kind restores exactly what it set, or refuses with
ChangedSince when someone changed it since. The approver, or the record's
owner for an Auto action, is told, unless they did the undo."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core import audit
from services.customers.models import Customer
from services.customers.scoping import can_open
from services.metrics.models import AgentAction

from .deciding import AlreadyDecided, CantDecide, decided_as, locked
from .registry import REGISTRY

S = AgentAction.Status
UNDO_DAYS = 7
#: kind -> what the notice calls the change
CHANGE = {
    "record.lifecycle": "lifecycle change",
    "record.owner": "owner change",
    "record.attribute": "attribute change",
    "task.create": "new task",
    "task.reassign": "reassignment",
    "task.redate": "due date change",
    "task.complete": "completed task",
    "task.snooze": "snooze",
    "note.create": "note",
    "initiative.create": "initiative",
}


class NotApplied(Exception):
    """Only an applied action can be undone."""


class UndoExpired(Exception):
    """More than 7 days since it applied."""


def undo_window(action):
    if action.applied_at is None:
        return None
    return action.applied_at + timedelta(days=UNDO_DAYS)


def undo(reader, pk):
    with transaction.atomic():
        action = locked(pk)
        role = decided_as(reader, action)
        if role is None:
            raise CantDecide()
        if action.status == S.UNDONE:
            raise AlreadyDecided(action)
        if action.status != S.APPLIED:
            raise NotApplied()
        if timezone.now() > undo_window(action):
            raise UndoExpired()
        REGISTRY[action.kind].undo(action, reader)
        action.status = S.UNDONE
        action.undone_by = reader
        action.undone_at = timezone.now()
        action.save(update_fields=["status", "undone_by", "undone_at"])
        audit.record(  # SOC2:LOG-01
            "agent_action.undone",
            actor=reader,
            target=action,
            metadata={"kind": action.kind, "agent": action.agent, "undone_as": role},
        )
        _tell(action, reader)
    return action


def _tell(action, reader):
    from services.notifications.models import Notification
    from services.notifications.realtime import notify

    record = action.record
    recipient = action.decided_by if not action.auto else getattr(record, "owner", None)
    if recipient is None or not recipient.is_active or recipient.pk == reader.pk:
        return
    agent = AgentAction.Agent(action.agent).label
    # SOC2:AUTH-02 a record is named only to someone who may open it
    if record is not None and can_open(recipient, record):
        message = f"{reader.name} undid the {agent}'s {CHANGE[action.kind]} on {record.name}."
    else:
        noun = "an organisation" if isinstance(record, Customer) else "an account"
        if record is None:
            noun = "the workspace"
            message = f"{reader.name} undid an agent action on {noun}."
        else:
            message = f"{reader.name} undid an agent action on {noun} you can't open."
    notify(
        recipient=recipient,
        actor=reader,
        kind=Notification.Kind.AGENT_ACTION_UNDONE,
        message=message[:500],
        link=f"/work/activity?action={action.pk}",
        push_on_commit=True,
    )
```

The refusal order is 403, then already-undone, then not applied, then expired, then changed since. The contract lists 404 first; the view does that check (Task 9) before calling `undo`.

- [ ] **Step 5: Run the tests**

Run: `venv/bin/python manage.py test services.agents --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/agents services/notifications/models.py services/notifications/migrations/0010_agent_action_undone.py
git commit -m "feat(agents): undo for 7 days, refused when changed since, with its notice

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The API — settings, Run now, Activity, decisions

**Files:**
- Create: `services/agents/payloads.py`, `services/agents/settings_api.py`, `services/agents/views.py`, `services/agents/urls.py`
- Modify: `config/urls.py` (`path("api/v1/agents/", include("services.agents.urls")),`)
- Test: `services/agents/tests/test_api_settings.py`, `services/agents/tests/test_api_actions.py`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `payloads.action_payload(action, reader) -> dict`: the contract's AgentAction
  - `payloads.card(profile, organisation, today) -> dict`
  - `settings_api.payload(organisation, reader) -> dict`
  - `settings_api.changes_from(organisation, data) -> dict`, which raises a `ValidationError` carrying every problem at once
  - `settings_api.save(organisation, reader, changes)`
  - `views.readable(reader, queryset) -> queryset`: the twice-filter that Waiting reuses
  - the routes in the contract

- [ ] **Step 1: Write the failing tests**

`services/agents/tests/test_api_settings.py`:

```python
"""GET/PATCH /agents/settings/ and POST /agents/<kind>/run/ (contract)."""

from unittest.mock import patch

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.agents.models import AgentProfile
from services.agents.policy import profiles_for
from services.agents.tests.fixtures import AgentsFixture
from services.metrics.models import AgentAction

URL = "/api/v1/agents/settings/"


class SettingsApiTests(AgentsFixture):
    def setUp(self):
        self.plan = patch("services.agents.policy.plan_credits", return_value=2000)
        self.plan.start()
        self.addCleanup(self.plan.stop)

    def get(self, user):
        response = self.client_for(user).get(URL)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_any_member_reads_the_cards_kinds_and_grid(self):
        data = self.get(self.csm)
        self.assertEqual([a["kind"] for a in data["agents"]], ["cs", "sales", "ops"])
        card = data["agents"][0]
        self.assertEqual(card["label"], "CS agent")
        self.assertEqual(card["monthly_credits"], 133)
        self.assertEqual(card["spent_this_month"], 0)
        self.assertIsNone(card["last_run"])
        self.assertEqual(data["kinds"][0]["kind"], "record.lifecycle")
        self.assertEqual(data["kinds"][1]["max_level"], "ask")
        self.assertEqual(data["levels"]["cs"]["record.lifecycle"], "ask")
        self.assertNotIn("record.lifecycle", data["levels"]["ops"])
        self.assertEqual(data["plan_monthly_credits"], 2000)
        self.assertFalse(data["can_edit"])
        self.assertFalse(data["can_run"])
        self.assertTrue(self.get(self.admin)["can_edit"])
        self.assertTrue(self.get(self.admin)["can_run"])
        self.assertTrue(self.get(self.lee)["can_run"] is False)

    def test_admin_changes_and_it_is_audited(self):
        response = self.client_for(self.admin).patch(
            URL,
            {
                "tone": "concise",
                "agents": {"cs": {"enabled": False, "monthly_credits": 200}},
                "levels": {"cs": {"record.lifecycle": "auto"}},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["tone"], "concise")
        self.assertFalse(response.data["agents"][0]["enabled"])
        self.assertEqual(response.data["levels"]["cs"]["record.lifecycle"], "auto")
        self.assertTrue(AuditEvent.objects.filter(action="agents.settings_update").exists())

    def test_every_problem_at_once(self):
        response = self.client_for(self.admin).patch(
            URL,
            {
                "ai_enabled": "yes",
                "tone": "shouty",
                "agents": {"hr": {}, "cs": {"enabled": 1, "monthly_credits": 5000}},
                "levels": {
                    "cs": {"initiative.create": "ask", "record.owner": "auto", "note.create": "x"}
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data,
            {
                "ai_enabled": ["Choose on or off."],
                "tone": ["Choose professional, friendly or concise."],
                "agents": {
                    "hr": ["Unknown agent."],
                    "cs": {
                        "enabled": ["Choose on or off."],
                        "monthly_credits": ["Choose a whole number from 0 to 2000."],
                    },
                },
                "levels": {
                    "cs": {
                        "initiative.create": ["That agent doesn't use this action."],
                        "record.owner": ["This action can't be set to auto."],
                        "note.create": ["Choose auto, ask or never."],
                    }
                },
            },
        )

    def test_never_expires_pending_actions_of_that_kind(self):
        action = AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="note.create",
            customer=self.pizza,
            target="note:x",
            title="t",
            rationale="r",
            payload={"title": "x", "body": "y"},
        )
        self.client_for(self.admin).patch(
            URL, {"levels": {"cs": {"note.create": "never"}}}, format="json"
        )
        action.refresh_from_db()
        self.assertEqual((action.status, action.expired_reason), ("expired", "never"))

    def test_a_member_cannot_change_them(self):
        response = self.client_for(self.csm).patch(URL, {"tone": "concise"}, format="json")
        self.assertEqual(response.status_code, 403)


class RunNowTests(AgentsFixture):
    def setUp(self):
        self.plan = patch("services.agents.policy.plan_credits", return_value=2000)
        self.plan.start()
        self.addCleanup(self.plan.stop)

    def test_runs_and_returns_the_card(self):
        with patch("services.agents.run.get_completion", return_value="[]"):
            response = self.client_for(self.admin).post("/api/v1/agents/cs/run/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["kind"], "cs")
        self.assertEqual(response.data["last_run"]["proposed"], 0)

    def test_refusals(self):
        self.assertEqual(self.client_for(self.csm).post("/api/v1/agents/cs/run/").status_code, 403)
        self.assertEqual(
            self.client_for(self.admin).post("/api/v1/agents/hr/run/").status_code, 404
        )
        Organisation.objects.filter(pk=self.org.pk).update(ai_agent_enabled=False)
        response = self.client_for(self.admin).post("/api/v1/agents/cs/run/")
        self.assertEqual((response.status_code, response.data["code"]), (409, "AI_OFF"))
        Organisation.objects.filter(pk=self.org.pk).update(ai_agent_enabled=True)
        profiles_for(self.org)
        AgentProfile.objects.filter(organisation=self.org, kind="cs").update(monthly_credits=0)
        response = self.client_for(self.admin).post("/api/v1/agents/cs/run/")
        self.assertEqual(response.data["code"], "BUDGET_USED")
        self.assertIn("resets_on", response.data)
```

`services/agents/tests/test_api_actions.py`:

```python
"""Activity, approve, reject and undo over HTTP (contract): the
twice-filter, hidden counts, evidence for view-all only, and the error
order."""

from django.utils import timezone

from services.agents.tests.fixtures import AgentsFixture
from services.metrics.models import AgentAction

LIST = "/api/v1/agents/actions/"


class ActionsApiTests(AgentsFixture):
    def make(self, record, **fields):
        fields.setdefault("status", "proposed")
        parent = (
            {"account": record} if record.__class__.__name__ == "Account" else {"customer": record}
        )
        return AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="record.lifecycle",
            target="lifecycle",
            title=f"Move {record.name}",
            rationale="Renews soon.",
            evidence=["Renews in 30 days"],
            payload={"stage": "renewal"},
            before=record.lifecycle_stage,
            **parent,
            **fields,
        )

    def test_activity_names_only_what_the_reader_opens(self):
        self.make(self.pizza)
        self.make(self.taco)
        data = self.client_for(self.csm).get(LIST).data
        self.assertEqual([r["record"]["name"] for r in data["results"]], ["Pizza Hut"])
        self.assertEqual(data["hidden"], 1)
        self.assertEqual(data["results"][0]["evidence"], [])
        self.assertEqual(data["results"][0]["rationale"], "Renews soon.")
        admin = self.client_for(self.admin).get(LIST).data
        self.assertEqual(admin["hidden"], 0)
        self.assertEqual(admin["results"][0]["evidence"][0]["label"], "Renews in 30 days")

    def test_filters_and_a_bad_filter(self):
        self.make(self.pizza)
        self.assertEqual(self.client_for(self.admin).get(LIST, {"agent": "ops"}).data["count"], 0)
        response = self.client_for(self.admin).get(LIST, {"agent": "hr"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"agent": ["Choose cs, sales or ops."]})

    def test_approve_then_already_decided(self):
        action = self.make(self.pizza)
        url = f"{LIST}{action.pk}/approve/"
        response = self.client_for(self.csm).post(url, {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["action"]["status"], "applied")
        self.assertTrue(response.data["action"]["undo"]["allowed"])
        again = self.client_for(self.mona).post(url, {}, format="json")
        self.assertEqual(again.status_code, 409)
        self.assertEqual(again.data["code"], "ALREADY_DECIDED")
        self.assertEqual(again.data["detail"], "Carl CSM already applied this.")

    def test_error_order(self):
        action = self.make(self.taco)
        url = f"{LIST}{action.pk}/approve/"
        self.assertEqual(self.client_for(self.csm).post(url).status_code, 404)
        self.assertEqual(self.client_for(self.lee).post(url).status_code, 404)
        mine = self.make(self.pizza)
        response = self.client_for(self.other).post(f"{LIST}{mine.pk}/approve/")
        self.assertEqual(response.status_code, 404)

    def test_expired_on_approve(self):
        action = self.make(self.pizza)
        type(self.pizza).objects.filter(pk=self.pizza.pk).update(lifecycle_stage="churn")
        response = self.client_for(self.csm).post(f"{LIST}{action.pk}/approve/")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "EXPIRED")
        self.assertEqual(
            response.data["detail"], "This action has expired: the record changed since."
        )

    def test_one_action_for_its_reader(self):
        mine = self.make(self.pizza)
        theirs = self.make(self.taco)
        ok = self.client_for(self.csm).get(f"{LIST}{mine.pk}/")
        self.assertEqual((ok.status_code, ok.data["id"]), (200, mine.pk))
        self.assertEqual(self.client_for(self.csm).get(f"{LIST}{theirs.pk}/").status_code, 404)
        self.assertEqual(self.client_for(self.admin).get(f"{LIST}{theirs.pk}/").status_code, 200)

    def test_undo_already_undone_carries_the_action(self):
        action = self.make(self.pizza)
        self.client_for(self.csm).post(f"{LIST}{action.pk}/approve/")
        self.client_for(self.csm).post(f"{LIST}{action.pk}/undo/")
        again = self.client_for(self.mona).post(f"{LIST}{action.pk}/undo/")
        self.assertEqual((again.status_code, again.data["code"]), (409, "ALREADY_DECIDED"))
        self.assertEqual(again.data["detail"], "Carl CSM already undid this.")
        self.assertEqual(again.data["action"]["status"], "undone")

    def test_reject_with_a_long_note_is_refused(self):
        action = self.make(self.pizza)
        response = self.client_for(self.csm).post(
            f"{LIST}{action.pk}/reject/", {"note": "x" * 256}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"note": ["Keep the note under 255 characters."]})

    def test_undo_over_http(self):
        action = self.make(self.pizza)
        self.client_for(self.csm).post(f"{LIST}{action.pk}/approve/")
        type(self.pizza).objects.filter(pk=self.pizza.pk).update(lifecycle_stage="churn")
        response = self.client_for(self.csm).post(f"{LIST}{action.pk}/undo/")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "CHANGED_SINCE")
        self.assertEqual((response.data["current"], response.data["applied"]), ("Churn", "Renewal"))
        not_applied = self.make(self.dough)
        response = self.client_for(self.csm).post(f"{LIST}{not_applied.pk}/undo/")
        self.assertEqual((response.status_code, response.data["code"]), (409, "NOT_APPLIED"))
        AgentAction.objects.filter(pk=action.pk).update(
            applied_at=timezone.now() - timezone.timedelta(days=8)
        )
        response = self.client_for(self.csm).post(f"{LIST}{action.pk}/undo/")
        self.assertEqual((response.status_code, response.data["code"]), (410, "UNDO_EXPIRED"))
```

Evidence labels: the contract's `evidence` items are `{label, link}` objects, but stored evidence is a list of strings. `payloads` maps each stored string `s` to `{"label": s, "link": <the record's link or None>}`. The tests above assert `["label"]`.

- [ ] **Step 2: Run them and watch them fail**

Run: `venv/bin/python manage.py test services.agents.tests.test_api_settings services.agents.tests.test_api_actions --parallel auto --noinput`
Expected: 404s (no routes).

- [ ] **Step 3: Write `payloads.py`**

```python
"""The contract's AgentAction and AgentCard shapes, written for one reader:
evidence for view_all readers only, undo's state as far as it can be read."""

from django.utils import timezone
from rest_framework import serializers

from services.customers.models import Customer
from services.customers.scoping import sees_everything
from services.customers.task_changes import person
from services.metrics.models import AgentAction

from .deciding import decided_as
from .policy import LABELS, resets_on, spent_this_month
from .registry import REGISTRY
from .undo import UNDO_DAYS, undo_window

_stamp = serializers.DateTimeField().to_representation


def _link(record):
    if record is None:
        return None
    if isinstance(record, Customer):
        return f"/organizations/{record.pk}"
    return f"/accounts/{record.pk}"


def record_payload(action):
    record = action.record
    if record is None:
        return None
    kind = "customer" if isinstance(record, Customer) else "account"
    return {"kind": kind, "id": record.pk, "name": record.name}


def _undo(action, reader):
    if action.status != AgentAction.Status.APPLIED:
        return None
    until = undo_window(action)
    reason = None
    if timezone.now() > until:
        reason = "expired"
    elif decided_as(reader, action) is None:
        reason = "cant_decide"
    else:
        spec = REGISTRY[action.kind]
        if spec.current(action) not in (None, action.after):
            reason = "changed_since"
    return {"allowed": reason is None, "until": _stamp(until), "reason": reason}


def _result(action):
    result = action.result or {}
    return {
        "task_id": result.get("task_id"),
        "note_id": result.get("note_id"),
        "initiative_id": result.get("initiative_id"),
    }


def action_payload(action, reader):
    link = _link(action.record)
    # SOC2:AUTH-02 evidence is written from the whole book: view_all_accounts only
    evidence = (
        [{"label": str(line), "link": link} for line in action.evidence]
        if sees_everything(reader)
        else []
    )
    return {
        "id": action.pk,
        "agent": action.agent,
        "kind": action.kind,
        "title": action.title,
        "status": action.status,
        "record": record_payload(action),
        "preview": REGISTRY[action.kind].preview(action),
        "rationale": action.rationale,
        "evidence": evidence,
        "decided_by": person(action.decided_by),
        "decided_at": None if action.decided_at is None else _stamp(action.decided_at),
        "auto": action.auto,
        "applied_at": None if action.applied_at is None else _stamp(action.applied_at),
        "undo": _undo(action, reader),
        "undone_by": person(action.undone_by),
        "undone_at": None if action.undone_at is None else _stamp(action.undone_at),
        "result": _result(action),
        "created_at": _stamp(action.created_at),
    }


def card(profile, organisation, today):
    last = profile.last_run or {}
    return {
        "kind": profile.kind,
        "label": LABELS[profile.kind],
        "enabled": profile.enabled,
        "monthly_credits": profile.monthly_credits,
        "spent_this_month": spent_this_month(organisation, profile.kind, today=today),
        "resets_on": resets_on(today).isoformat(),
        "last_run": None
        if profile.last_run_at is None
        else {
            "at": _stamp(profile.last_run_at),
            "proposed": last.get("proposed", 0),
            "applied": last.get("applied", 0),
            "dropped": last.get("dropped", 0),
            "skipped_reason": last.get("skipped_reason"),
        },
    }
```

`UNDO_DAYS` is imported for readers. If ruff flags it as unused, drop the import.

- [ ] **Step 4: Write `settings_api.py`**

```python
"""GET/PATCH /agents/settings/ (contract): the AI switch and tone, each
agent's switch and budget, and the grid. Every problem comes back at once;
a value equal to the stored one is not a change; setting a kind to never
expires its pending actions (Decision 4)."""

from django.db import transaction
from rest_framework.exceptions import ValidationError

from core import audit
from services.accounts.capabilities import Capability
from services.accounts.models import Organisation
from services.customers.scoping import sees_everything
from services.metrics.models import AgentAction

from .deciding import expire
from .kinds import LEVELS, NEVER, RANK
from .models import AgentPolicy, AgentProfile
from .payloads import card
from .policy import AGENTS, grid, level, plan_credits, policy_for, profiles_for
from .registry import REGISTRY

ON_OR_OFF = "Choose on or off."
CHOOSE_TONE = "Choose professional, friendly or concise."
UNKNOWN_AGENT = "Unknown agent."
NOT_USED = "That agent doesn't use this action."
CHOOSE_LEVEL = "Choose auto, ask or never."
NO_AUTO = "This action can't be set to auto."
TONES = tuple(Organisation.AgentTone.values)


def payload(organisation, reader):
    from services.work.clock import today_for

    today = today_for(organisation)
    profiles = profiles_for(organisation)
    return {
        "ai_enabled": organisation.ai_agent_enabled,
        "tone": organisation.ai_agent_tone,
        "agents": [card(profiles[agent], organisation, today) for agent in AGENTS],
        "kinds": [
            {
                "kind": spec.key,
                "label": spec.label,
                "example": spec.example,
                "max_level": spec.max_level,
                "agents": list(spec.agents),
            }
            for spec in REGISTRY.values()
        ],
        "levels": grid(policy_for(organisation)),
        "plan_monthly_credits": plan_credits(organisation),
        "can_edit": reader.has_capability(Capability.MANAGE_ORG_SETTINGS),
        # SOC2:AUTH-02 the Run now rule, so the page offers what the route allows
        "can_run": reader.has_capability(Capability.MANAGE_ORG_SETTINGS) or sees_everything(reader),
    }


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def changes_from(organisation, data):
    """{"organisation": {...}, "agents": {agent: {...}}, "levels": {...}}."""
    if not isinstance(data, dict):
        raise ValidationError({"non_field_errors": ["Send the fields as one object."]})
    errors = {}
    changes = {"organisation": {}, "agents": {}, "levels": {}}
    if "ai_enabled" in data:
        if isinstance(data["ai_enabled"], bool):
            if data["ai_enabled"] != organisation.ai_agent_enabled:
                changes["organisation"]["ai_agent_enabled"] = data["ai_enabled"]
        else:
            errors["ai_enabled"] = [ON_OR_OFF]
    if "tone" in data:
        if data["tone"] in TONES:
            if data["tone"] != organisation.ai_agent_tone:
                changes["organisation"]["ai_agent_tone"] = data["tone"]
        else:
            errors["tone"] = [CHOOSE_TONE]
    if "agents" in data:
        wrong = _agents(organisation, data["agents"], changes["agents"])
        if wrong:
            errors["agents"] = wrong
    if "levels" in data:
        wrong = _levels(organisation, data["levels"], changes["levels"])
        if wrong:
            errors["levels"] = wrong
    if errors:
        raise ValidationError(errors)
    return changes


def _agents(organisation, asked, out):
    if not isinstance(asked, dict):
        return [UNKNOWN_AGENT]
    profiles = profiles_for(organisation)
    ceiling = plan_credits(organisation)
    errors = {}
    for agent, fields in asked.items():
        if agent not in AGENTS or not isinstance(fields, dict):
            errors[agent] = [UNKNOWN_AGENT]
            continue
        wrong = {}
        if "enabled" in fields:
            if isinstance(fields["enabled"], bool):
                if fields["enabled"] != profiles[agent].enabled:
                    out.setdefault(agent, {})["enabled"] = fields["enabled"]
            else:
                wrong["enabled"] = [ON_OR_OFF]
        if "monthly_credits" in fields:
            value = fields["monthly_credits"]
            if _whole(value) and 0 <= value <= ceiling:
                if value != profiles[agent].monthly_credits:
                    out.setdefault(agent, {})["monthly_credits"] = value
            else:
                wrong["monthly_credits"] = [f"Choose a whole number from 0 to {ceiling}."]
        if wrong:
            errors[agent] = wrong
    return errors


def _levels(organisation, asked, out):
    if not isinstance(asked, dict):
        return [UNKNOWN_AGENT]
    prefs = policy_for(organisation)
    errors = {}
    for agent, kinds in asked.items():
        if agent not in AGENTS or not isinstance(kinds, dict):
            errors[agent] = [UNKNOWN_AGENT]
            continue
        wrong = {}
        for kind, value in kinds.items():
            spec = REGISTRY.get(kind)
            if spec is None or agent not in spec.agents:
                wrong[kind] = [NOT_USED]
            elif value not in LEVELS:
                wrong[kind] = [CHOOSE_LEVEL]
            elif RANK[value] < RANK[spec.max_level]:
                wrong[kind] = [NO_AUTO]
            elif value != level(prefs, agent, kind):
                out.setdefault(agent, {})[kind] = value
        if wrong:
            errors[agent] = wrong
    return errors


def save(organisation, reader, changes):
    with transaction.atomic():
        fields = changes["organisation"]
        if fields:
            Organisation.objects.filter(pk=organisation.pk).update(**fields)
        for agent, values in changes["agents"].items():
            AgentProfile.objects.filter(organisation=organisation, kind=agent).update(
                updated_by=reader, **values
            )
        if changes["levels"]:
            prefs = AgentPolicy.objects.select_for_update().get(pk=policy_for(organisation).pk)
            levels = dict(prefs.levels or {})
            for agent, kinds in changes["levels"].items():
                levels[agent] = {**levels.get(agent, {}), **kinds}
                for kind, value in kinds.items():
                    if value == NEVER:
                        for action in AgentAction.objects.filter(
                            organisation=organisation,
                            agent=agent,
                            kind=kind,
                            status=AgentAction.Status.PROPOSED,
                        ):
                            expire(action, "never")
            prefs.levels = levels
            prefs.updated_by = reader
            prefs.save(update_fields=["levels", "updated_by", "updated_at"])
        audit.record(  # SOC2:LOG-01
            "agents.settings_update",
            actor=reader,
            organisation=organisation,
            metadata={
                "fields": sorted(changes["organisation"]),
                "agents": sorted(changes["agents"]),
                "levels": {a: sorted(k) for a, k in changes["levels"].items()},
            },
        )
```

`Organisation.AgentTone` must exist under that name. Check `services/accounts/models.py` near `ai_agent_tone` and use the real class name.

- [ ] **Step 5: Write `views.py` and `urls.py`**

```python
"""The Agents routes (contract): settings, Run now, Activity, and the
three decisions. 404 for an action outside the workspace or on a record the
reader can't open, then 403, then the decision's own refusals."""

from django.core.paginator import EmptyPage, Paginator
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.utils.urls import replace_query_param
from rest_framework.views import APIView

from core import audit
from services.accounts.capabilities import Capability
from services.customers.scoping import sees_everything, visible_accounts, visible_customers
from services.customers.task_access import assignee_for
from services.metrics.models import AgentAction

from . import deciding, settings_api
from . import undo as undoing
from .kinds import ChangedSince
from .payloads import action_payload, card
from .policy import AGENTS, policy_for, profiles_for, resets_on
from .registry import REGISTRY
from .run import run, skip_reason

PAGE = 50
NOTE_LIMIT = 255
CHOOSE_AGENT = "Choose cs, sales or ops."
CHOOSE_KIND = "Choose an action kind."
CHOOSE_STATUS = "Choose proposed, applied, rejected, expired or undone."
CHOOSE_ID = "Choose a record id."
LONG_NOTE = "Keep the note under 255 characters."
VERB = {"applied": "applied", "rejected": "rejected", "undone": "undid", "expired": "expired"}


def readable(reader, queryset):
    """`queryset` cut to actions `reader` may read: on a record they may
    open; workspace-level ones for view_all readers only."""
    # SOC2:AUTH-02 the twice-filter, as id IN subqueries
    if sees_everything(reader):
        return queryset
    return queryset.filter(
        Q(customer_id__in=visible_customers(reader).values("id"))
        | Q(account_id__in=visible_accounts(reader).values("id"))
    )


def _code(code, detail, http=status.HTTP_409_CONFLICT, **extra):
    return Response({"code": code, "detail": detail, **extra}, status=http)


class AgentSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(settings_api.payload(request.user.organisation, request.user))

    def patch(self, request):
        # SOC2:AUTH-02 changing the agents is a workspace setting's right
        if not request.user.has_capability(Capability.MANAGE_ORG_SETTINGS):
            raise PermissionDenied("Only admins can change the agents.")
        organisation = request.user.organisation
        changes = settings_api.changes_from(organisation, request.data)
        if any(changes.values()):
            settings_api.save(organisation, request.user, changes)
            organisation.refresh_from_db()
        return Response(settings_api.payload(organisation, request.user))


class AgentRunView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, kind):
        from services.work import recommend
        from services.work.clock import today_for
        from services.work.models import Recommendation

        if kind not in AGENTS:
            raise NotFound("No such agent.")
        user = request.user
        # SOC2:AUTH-02 running an agent: admins or view_all readers
        if not (user.has_capability(Capability.MANAGE_ORG_SETTINGS) or sees_everything(user)):
            raise PermissionDenied("Only admins can run an agent.")
        organisation = user.organisation
        today = today_for(organisation)
        profile = profiles_for(organisation)[kind]
        reason = skip_reason(organisation, profile, policy_for(organisation), today)
        if reason == "ai_off":
            return _code("AI_OFF", "AI is switched off for this workspace.")
        if reason == "disabled":
            return _code("AGENT_OFF", "This agent is switched off.")
        if reason == "no_actions":
            return _code("NO_ACTIONS", "Every action is set to never for this agent.")
        if reason == "budget":
            day = resets_on(today)
            return _code(
                "BUDGET_USED",
                f"This agent's budget is used up: it resumes on {day.day} {day:%b}.",
                resets_on=day.isoformat(),
            )
        result = run(organisation, kind, actor=user)
        if result.skipped_reason == "credits":
            return Response(
                {"detail": "The workspace has no credits left."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        recommend.refresh(
            organisation, today=today, actor=user, kinds=[Recommendation.Kind.AGENT_ACTION]
        )
        audit.record(  # SOC2:LOG-01
            "agents.run", request=request, metadata={"agent": kind, **result.as_dict()}
        )
        profile.refresh_from_db()
        return Response(card(profile, organisation, today))


class ActionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        rows = AgentAction.objects.filter(organisation_id=request.user.organisation_id)
        errors = {}
        for name, allowed, message in (
            ("agent", AGENTS, CHOOSE_AGENT),
            ("kind", tuple(REGISTRY), CHOOSE_KIND),
            ("status", tuple(AgentAction.Status.values), CHOOSE_STATUS),
        ):
            if name in params:
                if params[name] in allowed:
                    rows = rows.filter(**{name: params[name]})
                else:
                    errors[name] = [message]
        for name in ("customer", "account"):
            if name in params:
                if params[name].isdigit():
                    rows = rows.filter(**{f"{name}_id": int(params[name])})
                else:
                    errors[name] = [CHOOSE_ID]
        if errors:
            raise ValidationError(errors)
        shown = readable(request.user, rows)
        count = shown.count()
        pages = Paginator(
            shown.select_related("customer", "account", "decided_by", "undone_by").order_by(
                "-created_at", "-id"
            ),
            PAGE,
        )
        number = int(params.get("page", 1)) if str(params.get("page", "1")).isdigit() else 1
        try:
            page = pages.page(number)
        except EmptyPage:
            page = None
        url = request.build_absolute_uri()
        return Response(
            {
                "count": count,
                "next": replace_query_param(url, "page", number + 1)
                if page is not None and page.has_next()
                else None,
                "previous": replace_query_param(url, "page", number - 1)
                if page is not None and page.has_previous()
                else None,
                "results": [action_payload(a, request.user) for a in (page or [])],
                "hidden": rows.count() - count,
            }
        )


class ActionDetailView(APIView):
    """GET /agents/actions/<id>/: one action for the reader (the undo
    notice's link). 404 outside the workspace, on a record the reader
    can't open, or workspace-level without view-all."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        rows = AgentAction.objects.filter(organisation_id=request.user.organisation_id, pk=pk)
        # SOC2:AUTH-02 the twice-filter: an action the reader can't read is missing
        action = readable(request.user, rows).first()
        if action is None:
            raise NotFound(deciding.NO_SUCH_ACTION)
        return Response(action_payload(action, request.user))


def _visible_action(request, pk):
    rows = AgentAction.objects.filter(organisation_id=request.user.organisation_id, pk=pk)
    # SOC2:AUTH-02 an action on a record the caller can't open reads as missing
    action = readable(request.user, rows).first()
    if action is None:
        raise NotFound(deciding.NO_SUCH_ACTION)
    if deciding.decided_as(request.user, action) is None:
        raise PermissionDenied({"code": "CANT_DECIDE", "detail": "You can't decide this action."})
    return action


def _already(action):
    who = action.undone_by if action.status == "undone" else action.decided_by
    name = who.name if who is not None else "Revenact"
    return _code(
        "ALREADY_DECIDED",
        f"{name} already {VERB.get(action.status, action.status)} this.",
        action=None,
    )


class ActionDecisionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, decision):
        if decision not in ("approve", "reject", "undo"):
            raise NotFound()
        action = _visible_action(request, pk)
        try:
            if decision == "approve":
                done, _ = deciding.approve(request.user, pk, **self._overrides(request, action))
            elif decision == "reject":
                note = str((request.data or {}).get("note") or "")
                if len(note) > NOTE_LIMIT:
                    raise ValidationError({"note": [LONG_NOTE]})
                done, _ = deciding.reject(request.user, pk, note=note)
            else:
                done = undoing.undo(request.user, pk)
        except deciding.CantDecide:
            raise PermissionDenied(
                {"code": "CANT_DECIDE", "detail": "You can't decide this action."}
            ) from None
        except deciding.AlreadyDecided as exc:
            response = _already(exc.action)
            response.data["action"] = action_payload(exc.action, request.user)
            return response
        except deciding.Expired as exc:
            reason = deciding.REASONS.get(exc.action.expired_reason, "it expired")
            return _code(
                "EXPIRED",
                f"This action has expired: {reason}.",
                action=action_payload(exc.action, request.user),
            )
        except undoing.NotApplied:
            return _code("NOT_APPLIED", "Only an applied action can be undone.")
        except undoing.UndoExpired:
            return _code(
                "UNDO_EXPIRED",
                "Undo is available for 7 days after an action applies.",
                http=status.HTTP_410_GONE,
            )
        except ChangedSince as exc:
            return _code("CHANGED_SINCE", exc.detail, current=exc.current, applied=exc.applied)
        return Response({"action": action_payload(done, request.user)})

    def _overrides(self, request, action):
        """task.create only: who, title, due date, priority, checked as
        Recommended's Assign checks them."""
        from services.work.views import AssignSerializer

        data = request.data or {}
        if action.kind != AgentAction.Kind.TASK_CREATE or not data:
            return {}
        body = AssignSerializer(data={"assignee_id": data.get("assignee_id"), **data})
        body.is_valid(raise_exception=True)
        clean = body.validated_data
        out = {
            "title": clean.get("title"),
            "due_date": clean.get("due_date"),
            "priority": clean.get("priority"),
        }
        if data.get("assignee_id") is not None:
            # SOC2:AUTH-02 the task goes only to an active member who can open its record
            out["assignee"] = assignee_for(
                request.user.organisation_id, clean["assignee_id"], action.record
            )
        return {k: v for k, v in out.items() if v is not None}
```

The 403-before-404 refinements are covered by `_visible_action`. Drop the unused `timezone` import if ruff flags it.

`urls.py`:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("settings/", views.AgentSettingsView.as_view(), name="agent-settings"),
    path("actions/", views.ActionListView.as_view(), name="agent-actions"),
    path("actions/<int:pk>/", views.ActionDetailView.as_view(), name="agent-action"),
    path(
        "actions/<int:pk>/<str:decision>/",
        views.ActionDecisionView.as_view(),
        name="agent-action-decision",
    ),
    path("<str:kind>/run/", views.AgentRunView.as_view(), name="agent-run"),
]
```

In `services/work/models.py`, add the kind `AGENT_ACTION` now if Task 10 hasn't renamed it yet. **To keep this task green, refer to `Recommendation.Kind.AGENT` in `AgentRunView` and switch it to `AGENT_ACTION` in Task 10.**

- [ ] **Step 6: Run the tests**

Run: `venv/bin/python manage.py test services.agents --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/agents config/urls.py
git commit -m "feat(agents): settings, Run now, Activity and the decision routes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Recommended and Waiting carry every action kind

**Files:**
- Modify: `services/work/models.py` (kind `agent` → `agent_action`; field `proposal` → `agent_action`; constraints. The source key `agent` in `DEFAULT_SOURCES` is **unchanged**, per the contract.)
- Create: `services/work/migrations/0004_agent_action.py` (generated, then edited)
- Modify: `services/work/{sources,routing,defaults,deciding,recommend,recommendations,rec_access,views}.py`
- Modify: `services/brain/{desk,waiting,graph}.py`, `services/copilot/brain_grounding.py`, `services/metrics/graph.py`
- Modify: `services/agents/views.py` (`Recommendation.Kind.AGENT_ACTION`)
- Test: `services/agents/tests/test_recommended.py`, `services/agents/tests/test_waiting.py`. Update the Work and Brain tests that reference `"agent"`, `"proposal"` or `proposal=`.

**Interfaces:**
- Produces:
  - `Recommendation.Kind.AGENT_ACTION = "agent_action"`; the source key stays `"agent"` (`recommend.source_key`)
  - `Recommendation.agent_action` (FK to `metrics.AgentAction`)
  - `Signal.agent_action`
  - `work.sources.agent_action(book, params)`
  - Waiting item kind `"agent_action"`, whose `detail` is `action_payload(...)` plus `"session"`
  - `brain.desk.KINDS = ("rule_review", "agent_action", "question", "overdue_task")`
  - `brain.desk.agent_actions(reader, scope, sessions) -> Source`

- [ ] **Step 1: Write the failing tests**

`services/agents/tests/test_recommended.py`:

```python
"""Agent actions in Work › Recommended (contract): every record kind is a
recommendation of kind agent_action; task.create is assigned through Assign,
the rest through Apply; dismiss rejects any kind; deciding in either place
settles both."""

from services.agents import deciding
from services.agents.tests.fixtures import AgentsFixture
from services.metrics.models import AgentAction
from services.work.models import Recommendation
from services.work.recommend import refresh
from services.work.tests.recommend_fixtures import RecommendFixture


class RecommendedTests(AgentsFixture, RecommendFixture):
    def make(self, kind="record.lifecycle", payload=None, record=None):
        record = record or self.pizza
        return AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind=kind,
            customer=record,
            target="lifecycle" if kind == "record.lifecycle" else "task:call",
            title="Move Pizza Hut to renewal",
            rationale="r",
            payload=payload or {"stage": "renewal"},
            before=record.lifecycle_stage,
        )

    def test_a_proposed_action_becomes_a_recommendation(self):
        action = self.make()
        self.only("agent")
        self.refresh_now()
        rec = Recommendation.objects.get(kind="agent_action")
        self.assertEqual(rec.agent_action_id, action.pk)
        data = self.ok(self.mona, "/api/v1/work/recommendations/?scope=team")
        item = data["items"][0]
        self.assertEqual(item["kind"], "agent_action")
        self.assertEqual(item["agent_action"]["preview"]["to"], "Renewal")
        self.assertEqual(item["why"], {"facts": [], "evidence": []})
        self.assertIsNone(item["defaults"])

    def test_assign_on_a_non_task_kind_says_use_apply(self):
        self.make()
        self.only("agent")
        self.refresh_now()
        rec = Recommendation.objects.get()
        response = self.post(
            self.mona,
            f"/api/v1/work/recommendations/{rec.pk}/assign/",
            {"assignee_id": self.csm.pk},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "USE_APPLY")

    def test_applying_settles_the_recommendation(self):
        action = self.make()
        self.only("agent")
        self.refresh_now()
        deciding.approve(self.csm, action.pk)
        rec = Recommendation.objects.get()
        self.assertEqual(rec.status, "assigned")

    def test_dismiss_rejects_any_kind(self):
        action = self.make()
        self.only("agent")
        self.refresh_now()
        rec = Recommendation.objects.get()
        response = self.post(
            self.mona,
            f"/api/v1/work/recommendations/{rec.pk}/dismiss/",
            {"reason": "not_relevant"},
        )
        self.assertEqual(response.status_code, 200, response.data)
        action.refresh_from_db()
        self.assertEqual(action.status, "rejected")

    def test_an_expired_action_expires_its_recommendation(self):
        action = self.make()
        self.only("agent")
        self.refresh_now()
        deciding.expire(AgentAction.objects.get(pk=action.pk), "changed")
        self.assertEqual(Recommendation.objects.get().status, "expired")

    def test_the_agent_source_switch_still_governs_agent_actions(self):
        self.make()
        self.only("renewal_due")  # every source off but renewals: "agent" is off
        self.refresh_now()
        self.assertFalse(Recommendation.objects.filter(kind="agent_action").exists())
```

**Two fixtures:** `AgentsFixture` and `RecommendFixture` both subclass `BrainFixture`. Use `class RecommendedTests(RecommendFixture)` and create `sam` and `deals` inline only if a test needs them; this file doesn't. **Use `RecommendFixture` alone.**

`services/agents/tests/test_waiting.py`:

```python
"""Brain › Waiting lists agent actions of every kind (contract): kind
agent_action, the AgentAction as detail, evidence for view-all only, and
workspace-level actions for view-all only (Decision 11)."""

from services.agents.tests.fixtures import AgentsFixture
from services.metrics.models import AgentAction

URL = "/api/v1/brain/waiting/?scope=company"


class WaitingTests(AgentsFixture):
    def test_items_are_agent_actions(self):
        AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="record.lifecycle",
            customer=self.pizza,
            target="lifecycle",
            title="Move Pizza Hut",
            rationale="r",
            evidence=["Renews soon"],
            payload={"stage": "renewal"},
            before=self.pizza.lifecycle_stage,
        )
        AgentAction.objects.create(
            organisation=self.org,
            agent="ops",
            batch="b",
            kind="initiative.create",
            target="initiative:nrr::",
            title="Lift NRR",
            rationale="r",
            payload={"metric": "nrr", "metric_label": "NRR", "target_value": 1, "target_by": "x"},
        )
        admin = self.client_for(self.admin).get(URL).data
        kinds = sorted(i["detail"]["kind"] for i in admin["items"] if i["kind"] == "agent_action")
        self.assertEqual(kinds, ["initiative.create", "record.lifecycle"])
        mona = self.client_for(self.mona).get("/api/v1/brain/waiting/?scope=team").data
        rows = [i for i in mona["items"] if i["kind"] == "agent_action"]
        self.assertEqual([r["detail"]["kind"] for r in rows], ["record.lifecycle"])
        self.assertEqual(rows[0]["detail"]["evidence"], [])
        self.assertTrue(rows[0]["can_decide"])
        self.assertIsNone(rows[0]["detail"]["session"])
        self.assertEqual(rows[0]["record"]["type"], "customer")
        self.assertIn("agent_action", mona["counts"])
        self.assertNotIn("proposal", mona["counts"])
```

Check `scope` values against `services/brain/scope.py` (`me`, `team`, `company`) and Brain's waiting URL in `services/brain/urls.py`. Adjust the two URLs to the real ones.

- [ ] **Step 2: Run them and watch them fail**

Run: `venv/bin/python manage.py test services.agents.tests.test_recommended services.agents.tests.test_waiting --parallel auto --noinput`
Expected: FAIL (kind `agent`, no `agent_action` field).

- [ ] **Step 3: The Work model and migration**

In `services/work/models.py`:
- `DEFAULT_SOURCES["agent"]` stays as it is: the source key is not renamed (contract).
- `Kind.AGENT` becomes `AGENT_ACTION = "agent_action", "AI agent"`.
- The field `proposal` becomes `agent_action`, with `help_text="The agent's action; set only when the kind is agent_action."`.
- In both partial constraints, `~Q(kind="agent")` becomes `~Q(kind="agent_action")`.
- `rec_one_per_proposal` becomes `rec_one_per_agent_action` on `fields=["agent_action"]`.
- Update the docstring.

Run `venv/bin/python manage.py makemigrations work --name agent_action`. Answer **yes** if it asks whether `proposal` was renamed to `agent_action`, or write the `RenameField` by hand. Then edit the generated file so that a `RunPython` sits **after** the `RemoveConstraint` operations and **before** the `AddConstraint` operations:

```python
def forwards(apps, schema_editor):
    # The source key in WorkSettings.sources stays "agent" (contract).
    Recommendation = apps.get_model("work", "Recommendation")
    Recommendation.objects.filter(kind="agent").update(kind="agent_action")


def backwards(apps, schema_editor):
    Recommendation = apps.get_model("work", "Recommendation")
    Recommendation.objects.filter(kind="agent_action").update(kind="agent")
```

Add `migrations.RunPython(forwards, backwards)` in that position. Then run `makemigrations --check --dry-run`; it must report no changes.

- [ ] **Step 4: The Work source, routing, defaults, deciding and payload**

`services/work/sources.py`:
- `Signal.proposal` becomes `agent_action`.
- `key` returns `("agent_action", self.agent_action.pk)`.
- `agent()` becomes:

```python
def agent_action(book, params):
    """Every proposed agent action on a live organisation or account of the
    book, unless a recommendation for it was already assigned or dismissed.
    The title is the action's own; its rationale and evidence stay with the
    action (`action_payload`), written for each reader."""
    from services.metrics.models import AgentAction

    decided = Recommendation.objects.filter(
        agent_action__isnull=False,
        status__in=[Recommendation.Status.ASSIGNED, Recommendation.Status.DISMISSED],
    ).values("agent_action_id")
    pending = (
        AgentAction.objects.filter(
            organisation=book.organisation, status=AgentAction.Status.PROPOSED
        )
        .exclude(kind=AgentAction.Kind.INITIATIVE_CREATE)
        .exclude(id__in=decided)
        .order_by("created_at", "id")
    )
    found = []
    for action in pending:
        if action.account_id is not None:
            account = book.accounts.get(action.account_id)
            customer = book.parent_of.get(action.account_id)
        else:
            account, customer = None, book.customers.get(action.customer_id)
        if customer is None or (action.account_id is not None and account is None):
            continue
        # `why` stays empty (contract): the card shows the action's own
        # rationale and evidence, written for each reader.
        found.append(
            Signal(
                kind=K.AGENT_ACTION,
                customer=customer,
                account=account,
                title=action.title[:255],
                facts=(),
                evidence=(),
                value=None,
                agent_action=action,
            )
        )
    return found
```

The `SOURCES` map entry becomes `K.AGENT_ACTION: agent_action`.

In `services/work/recommend.py`, a kind's settings are read under its source key:

```python
#: The Work settings key a kind's switch and thresholds live under. The
#: agent's recommendations were renamed; their switch was not (contract).
SOURCE_KEYS = {K.AGENT_ACTION: "agent"}


def source_key(kind):
    return SOURCE_KEYS.get(kind, kind)
```

`refresh` reads `params[source_key(kind)]` wherever it read `params[kind]`. Grep `params\[` in `recommend.py` and `sources.py`.

`routing.py` `candidates`:

```python
        if signal.agent_action is not None:
            payload = signal.agent_action.payload or {}
            if signal.agent_action.kind == "task.create":
                if isinstance(payload.get("assignee_id"), int):
                    yield self.person(self.people().get(payload["assignee_id"]))
                elif payload.get("assignee_name"):
                    yield self.named(str(payload["assignee_name"]))
            yield self.person(signal.record.owner)
            return
```

`defaults.py`: `rec.proposal` becomes `rec.agent_action`, and `.action` becomes `.payload`.

`recommendations.row_payload`:
- `"proposal": rec.proposal_id` becomes `"agent_action": action_payload(rec.agent_action, reader) if rec.agent_action_id else None`. This needs `reader`, so pass it through `build` → `row_payload(rec, today=..., opens=..., working_days=..., reader=reader)`.
- `"defaults"` is `None` when `rec.agent_action_id and rec.agent_action.kind != "task.create"`.

`LIST_RELATED` and `RELATED`: `"proposal"` becomes `"agent_action"`, and add `"agent_action__customer"` and `"agent_action__account"`.

`recommend.py`:
- `_key`, `held_back` and `last_decisions` use `agent_action_id` / `signal.agent_action`.
- `ONE_OPEN` gets the new constraint name.
- `settle_for_action` filters `agent_action=action`.

`deciding.py`:
- `_locked` reads `agent_action_id` and locks `AgentAction` first.
- `_settled` uses `rec.agent_action`.
- `_assign`:

```python
    if rec.agent_action_id is not None:
        if rec.agent_action.kind != "task.create":
            raise UseApply()
        from services.agents.deciding import apply_action

        apply_action(
            rec.agent_action,
            reader,
            assignee=assignee,
            title=title,
            due_date=due,
            priority=priority,
            description=describe(facts),
            facts=facts,
            event_data={"recommendation": rec.pk},
        )
        return Recommendation.objects.select_related(*RELATED, "task").get(pk=rec.pk)
```

Add `class UseApply(Exception)`. In `services/work/views.py` `RecommendationAssignView`, catch it:

```python
        except deciding.UseApply:
            return Response(
                {"code": "USE_APPLY", "detail": "Apply or reject this one instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
```

Check the action is still proposed and not stale before `apply_action`. Wrap it:

```python
        from services.agents.deciding import Expired, expire, stale_reason

        if rec.agent_action.status != "proposed":
            raise AlreadyDecided(rec)
        reason = stale_reason(rec.agent_action, timezone.now())
        if reason is not None:
            expire(rec.agent_action, reason)
            raise AlreadyDecided(Recommendation.objects.get(pk=rec.pk))
```

The settled recommendation then answers 409 as Recommended does today, with status `expired`.

`dismiss` for an `agent_action` rec rejects through `services.agents.deciding`'s reject logic, not the old `proposals.reject`. The action's row is already locked in `_locked`, so call a lock-free helper. Add `deciding.reject_locked(action, reader, note)`, factored out of `reject`'s `run` closure, and use it from both places.

- [ ] **Step 5: Brain**

`services/brain/desk.py`:
- `KINDS = ("rule_review", "agent_action", "question", "overdue_task")`.
- `session_ids_seen_whole` uses `AgentAction`.
- `proposals()` becomes `agent_actions()`:

```python
def agent_actions(reader, scope, sessions):
    """Agent actions wait on their record's owner; workspace-level ones on
    Company. In Me, so do the facilitator's from a session the reader took
    part in."""
    from services.customers.models import Account, Customer
    from services.customers.scoping import sees_everything, visible_accounts, visible_customers
    from services.metrics.models import AgentAction

    base = AgentAction.objects.filter(
        organisation_id=reader.organisation_id, status=AgentAction.Status.PROPOSED
    )
    owners = _owners(scope)
    if owners is None:
        waiting = base
    else:
        owned_customers = Customer.objects.filter(
            organisation_id=reader.organisation_id, owner_id__in=owners
        ).values("id")
        owned_accounts = Account.objects.filter(owner_id__in=owners).values("id")
        on_desk = Q(customer_id__in=owned_customers) | Q(account_id__in=owned_accounts)
        if scope.key == ME and sessions:
            on_desk |= Q(session_id__in=sorted(sessions))
        waiting = base.filter(on_desk)
    if sees_everything(reader):
        readable = waiting
    else:
        # SOC2:AUTH-02 an action is shown only on a record the reader may open;
        # workspace-level ones only to view_all readers (Decision 11)
        readable = waiting.filter(
            Q(customer_id__in=visible_customers(reader).values("id"))
            | Q(account_id__in=visible_accounts(reader).values("id"))
        )
    return Source("agent_action", waiting, readable)
```

Update `sources()` to call it. `Account.objects.filter(owner_id__in=owners)` is not cut to the workspace on its own, but `base` already is, so it is safe. Add the workspace cut anyway, through `Account.customers.through` (`id__in`).

`services/brain/waiting.py`:
- Delete `customer_owner_id`, the old `decided_as` and `can_decide`. Re-export from `services.agents.deciding` for callers that still import them: `from services.agents.deciding import decided_as  # noqa: F401`.
- `_proposal_rows` becomes `_agent_action_rows`:

```python
def _agent_action_rows(reader, readable, sessions):
    from services.agents.deciding import decided_as
    from services.agents.payloads import action_payload
    from services.copilot.views import NEUTRAL_TITLE

    actions = list(
        readable.select_related(
            "customer__owner", "account__owner", "session__conversation", "decided_by"
        ).order_by("created_at", "id")[:LIMIT]
    )
    rows = []
    for action in actions:
        record = action.record
        session = None
        if action.session_id:
            # SOC2:AUTH-02 a conversation's title is for those who see it whole
            title = (
                action.session.conversation.title
                if action.session_id in sessions
                else NEUTRAL_TITLE
            )
            session = {"id": action.session_id, "title": title}
        kind = "customer" if action.customer_id else "account"
        rows.append(
            (
                action.created_at,
                {
                    "kind": "agent_action",
                    "id": action.pk,
                    "title": action.title,
                    "since": action.created_at.isoformat(),
                    "waiting_on": _person(record.owner) if record is not None else None,
                    "record": _record(kind, record) if record is not None else None,
                    "can_decide": decided_as(reader, action) is not None,
                    "detail": {**action_payload(action, reader), "session": session},
                },
            )
        )
    return rows
```

`build()` uses `found["agent_action"]` and `_agent_action_rows`.

Waiting's `counts` key `proposal` becomes `agent_action` on its own, because `build()` keys `counts` by `desk.KINDS`. The waiting test asserts `"agent_action" in data["counts"]`. Waiting items keep `record: {type, id, name}` (`_record`), as the contract's Compatibility section says.

`services/copilot/brain_grounding.py` `WAITING_KINDS`: the key `"proposal"` becomes `"agent_action": ("Agent action", "agent action", "agent actions")`.

`services/brain/graph.py` and `services/metrics/graph.py`: the graph is unchanged (contract, Decision 20).
- They read `desk.agent_actions(...)` and the `AgentAction` proposed rows, **filtered to `agent="ops"` and `kind__in=["task.create", "initiative.create"]`**: the legacy proposals the graph has always shown.
- `proposal_part` keeps the node kind `"proposal"` and its `proposal_kind` (the legacy word, from `LEGACY_KIND`).
- Its `acts_on` edge uses `p.customer_id`.
- A graph test asserts that a CS agent's `record.lifecycle` action does not appear on `/brain/graph/`.

`services/agents/views.py`: `Recommendation.Kind.AGENT` becomes `AGENT_ACTION`.

**Other places:** in the Brain and Work tests and fixtures, every `"agent"` kind, `proposal=` and `"proposal"` waiting kind becomes `agent_action`. Find them with `grep -rn "\"agent\"\|Kind.AGENT\b\|proposal=\|\"proposal\"" services/work/tests services/brain/tests services/copilot/tests`. Assertions on the *legacy* `/metrics/proposals/` routes keep their words.

- [ ] **Step 6: Run the affected suites**

Run: `venv/bin/python manage.py test services.agents services.work services.brain services.metrics services.copilot --parallel auto --noinput` and `venv/bin/python manage.py makemigrations --check --dry-run`
Expected: PASS, and no changes.

- [ ] **Step 7: Commit**

```bash
git add services/work services/brain services/copilot services/metrics/graph.py services/agents
git commit -m "feat(agents): Recommended and Waiting carry every agent action kind

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Compatibility — the old proposals routes and the AI switch

**Files:**
- Modify: `services/metrics/views.py` (`ProposalGenerateView` and `ProposalDecisionView` delegate to `services.agents`)
- Modify: `services/metrics/proposals.py` (remove `generate_proposals`; keep `build_evidence`, `build_prompt`, `_parse`, `_validate`, `store_answer`, `match_member` and the thin `approve`/`reject`)
- Test: `services/agents/tests/test_compat.py`. Update `services/metrics/tests/test_proposals.py` where it called `generate_proposals`.

**Interfaces:**
- `POST /metrics/proposals/generate/` runs the `ops` agent: `201 {"proposals": [legacy payload of the actions this pass created]}`.
  - 409 `{detail}` when the AI is off, the agent is off, or every action is never.
  - 429 when the budget or the credits are used.
  - 502 on failure.
- `POST /metrics/proposals/<id>/approve|reject/` decides through `services.agents.deciding` and answers `{"proposal": legacy}`, with today's trim for non-view-all readers.
  - 403 `{detail}` and 409 `{detail}` as today; an expired action is a 409 with the expiry sentence.

- [ ] **Step 1: Write the failing tests**

`services/agents/tests/test_compat.py`:

```python
"""The old /metrics/proposals/ routes keep working for one release over
agent actions (contract, Compatibility), and the AI switch now stops the
agents."""

import json
from unittest.mock import patch

from services.accounts.models import Organisation
from services.agents.tests.fixtures import AgentsFixture
from services.metrics.models import AgentAction


class CompatTests(AgentsFixture):
    def setUp(self):
        self.plan = patch("services.agents.policy.plan_credits", return_value=2000)
        self.plan.start()
        self.addCleanup(self.plan.stop)

    def test_generate_runs_the_ops_agent_and_answers_the_old_shape(self):
        item = {
            "kind": "task.create",
            "record": f"customer:{self.pizza.pk}",
            "title": "Call Pizza Hut",
            "rationale": "r",
            "evidence": ["e"],
            "payload": {"title": "Call Pizza Hut", "assignee_id": self.csm.pk, "due_in_days": 3},
        }
        with patch("services.agents.run.get_completion", return_value=json.dumps([item])):
            response = self.client_for(self.admin).post("/api/v1/metrics/proposals/generate/")
        self.assertEqual(response.status_code, 201, response.data)
        proposal = response.data["proposals"][0]
        self.assertEqual((proposal["kind"], proposal["status"]), ("task", "proposed"))
        self.assertEqual(proposal["action"]["customer_id"], self.pizza.pk)

    def test_generate_refuses_when_ai_is_off(self):
        Organisation.objects.filter(pk=self.org.pk).update(ai_agent_enabled=False)
        response = self.client_for(self.admin).post("/api/v1/metrics/proposals/generate/")
        self.assertEqual(response.status_code, 409)

    def test_the_old_decision_route_applies_an_agent_action(self):
        action = AgentAction.objects.create(
            organisation=self.org,
            batch="b",
            kind="task.create",
            customer=self.pizza,
            target="task:call",
            title="Call",
            rationale="r",
            payload={
                "title": "Call",
                "assignee_id": None,
                "assignee_name": "Carl CSM",
                "due_date": self.today.isoformat(),
                "priority": "high",
            },
        )
        response = self.client_for(self.csm).post(f"/api/v1/metrics/proposals/{action.pk}/approve/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["proposal"]["status"], "approved")
        action.refresh_from_db()
        self.assertEqual(action.status, "applied")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `venv/bin/python manage.py test services.agents.tests.test_compat --parallel auto --noinput`
Expected: FAIL. Generate still runs the old prompt, and the payload shape differs.

- [ ] **Step 3: Delegate the old views**

`ProposalGenerateView.post`:

```python
def post(self, request):
    from rest_framework import status

    from services.agents.run import run

    before = set(
        AgentAction.objects.filter(organisation=request.user.organisation).values_list(
            "id", flat=True
        )
    )
    result = run(request.user.organisation, "ops", actor=request.user)
    refusals = {
        "ai_off": (status.HTTP_409_CONFLICT, "AI is switched off for this workspace."),
        "disabled": (status.HTTP_409_CONFLICT, "The Ops agent is switched off."),
        "no_actions": (status.HTTP_409_CONFLICT, "Every action is set to never for this agent."),
        "budget": (status.HTTP_429_TOO_MANY_REQUESTS, "The Ops agent's budget is used up."),
        "credits": (status.HTTP_429_TOO_MANY_REQUESTS, "The workspace has no credits left."),
        "failed": (status.HTTP_502_BAD_GATEWAY, "The agent could not answer. Try again."),
    }
    if result.skipped_reason in refusals:
        code, detail = refusals[result.skipped_reason]
        return Response({"detail": detail}, status=code)
    made = (
        AgentAction.objects.filter(organisation=request.user.organisation)
        .exclude(id__in=before)
        .filter(kind__in=list(LEGACY_KIND))
        .select_related(
            "initiative", "decided_by", "generated_by", "session__conversation", "customer"
        )
    )
    return Response(
        {"proposals": [_proposal_payload(p) for p in made]}, status=status.HTTP_201_CREATED
    )
```

`ProposalDecisionView.post` keeps its 404, then 403, then 409 order and its trim, with the body of the `try` replaced by:

```python
        from services.agents import deciding as agents_deciding

        try:
            if decision == "approve":
                proposal, _ = agents_deciding.approve(request.user, proposal.pk, note=note)
            else:
                proposal, _ = agents_deciding.reject(request.user, proposal.pk, note=note)
            audit.record(  # SOC2:LOG-01
                f"proposal.{LEGACY_STATUS[proposal.status][0]}",
                request=request,
                target=proposal,
                target_repr=f"Proposal {proposal.pk}",
                metadata={"kind": proposal.kind, "decided_as": role},
            )
        except agents_deciding.AlreadyDecided as exc:
            label = LEGACY_STATUS[exc.action.status][1].lower()
            return Response(
                {"detail": f"This proposal was already {label}."}, status=status.HTTP_409_CONFLICT
            )
        except agents_deciding.Expired as exc:
            reason = agents_deciding.REASONS.get(exc.action.expired_reason, "it expired")
            return Response(
                {"detail": f"This proposal has expired: {reason}."},
                status=status.HTTP_409_CONFLICT,
            )
```

`role` comes from `services.agents.deciding.decided_as`, in place of `services.brain.waiting.decided_as`. Remove the now-unused `Customer.DoesNotExist` branch.

Delete `generate_proposals` and `SYSTEM_PROMPT` from `proposals.py`. Keep `MAX_PROPOSALS`, which the facilitator uses. Update `services/metrics/tests/test_proposals.py`: the tests of `generate_proposals` move to driving `store_answer` directly with the same `_answer(...)` text, which still exercises `_validate`. Delete the generation-route tests that `test_compat.py` now covers.

- [ ] **Step 4: Run the tests**

Run: `venv/bin/python manage.py test services.agents services.metrics services.brain services.copilot --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/metrics services/agents
git commit -m "feat(agents): the old proposals routes run over agent actions; the AI switch stops agents

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Privacy, query shape, docs, full suite

**Files:**
- Create: `services/agents/tests/test_privacy.py` and `services/agents/tests/test_queries.py`
- Modify:
  - `docs/API_CONTRACTS.md`
  - `docs/audit-events.md`
  - `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md` and `06-implementation-plan.md`
  - `docs/data-classification.md` (`AgentAction`, `AgentProfile`, `AgentPolicy`)
  - the two plan files, which get ruff-formatted

- [ ] **Step 1: The privacy and no-DISTINCT tests**

`services/agents/tests/test_privacy.py`:

```python
"""Every agents route with a member, a manager, a view-all reader and a
stranger: counted, never named; evidence for view-all only; a stranger sees
nothing of another workspace."""

from services.agents.tests.fixtures import AgentsFixture
from services.metrics.models import AgentAction


class PrivacyTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        for record in (cls.pizza, cls.taco, cls.globex):
            AgentAction.objects.create(
                organisation=record.organisation,
                agent="cs",
                batch="b",
                kind="note.create",
                customer=record,
                target="note:x",
                title=f"Note on {record.name}",
                rationale="r",
                evidence=["secret figure"],
                payload={"title": "x", "body": "y"},
            )

    def names(self, user):
        data = self.client_for(user).get("/api/v1/agents/actions/").data
        return sorted(r["record"]["name"] for r in data["results"]), data["hidden"]

    def test_member_manager_view_all_and_stranger(self):
        self.assertEqual(self.names(self.csm), (["Pizza Hut"], 1))
        self.assertEqual(self.names(self.mona), (["Pizza Hut"], 1))
        self.assertEqual(self.names(self.admin), (["Pizza Hut", "Taco Bell"], 0))
        self.assertEqual(self.names(self.stranger), (["Globex Corp"], 0))

    def test_another_workspaces_action_is_a_404(self):
        theirs = AgentAction.objects.get(customer=self.globex)
        response = self.client_for(self.admin).post(f"/api/v1/agents/actions/{theirs.pk}/approve/")
        self.assertEqual(response.status_code, 404)
```

`services/agents/tests/test_queries.py`:

```python
"""Postgres 16: no agents query uses DISTINCT."""

import json
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.models import Organisation, User
from services.agents import evidence, run
from services.agents.tests.fixtures import AgentsFixture


class QueryShapeTests(AgentsFixture):
    def test_no_distinct_anywhere(self):
        org = Organisation.objects.get(pk=self.org.pk)
        item = {
            "kind": "note.create",
            "record": f"customer:{self.pizza.pk}",
            "title": "t",
            "rationale": "r",
            "evidence": [],
            "payload": {"title": "t", "body": "b"},
        }
        with (
            patch("services.agents.policy.plan_credits", return_value=3000),
            CaptureQueriesContext(connection) as queries,
        ):
            for agent in ("cs", "sales", "ops"):
                evidence.build(org, agent, today=self.today)
            with patch("services.agents.run.get_completion", return_value=json.dumps([item])):
                result = run.run(org, "cs")
            for reader in (self.csm, self.mona, self.admin, self.lee):
                user = User.objects.get(pk=reader.pk)
                self.client_for(user).get("/api/v1/agents/actions/")
                self.client_for(user).get("/api/v1/agents/settings/")
        self.assertEqual(result.proposed, 1)
        offenders = [q["sql"] for q in queries if "DISTINCT" in q["sql"].upper()]
        self.assertEqual(offenders, [])
```

Run: `venv/bin/python manage.py test services.agents.tests.test_privacy services.agents.tests.test_queries --parallel auto --noinput`
Expected: PASS. If a DISTINCT appears, rewrite that filter as an `id__in` subquery. Never weaken the test.

- [ ] **Step 2: Docs**

- **`docs/API_CONTRACTS.md`:** add an "Agents" section from the contract file, following the api-contracts skill. Note the Work kind and source rename (`agent` → `agent_action`), Waiting's `agent_action` kind, and the compatibility wrappers.
- **`docs/audit-events.md`:** add `agent_action.applied`, `agent_action.rejected`, `agent_action.undone`, `agents.settings_update` and `agents.run`.
- **`01-prd.md`:** the agents section.
- **`02-trd.md`:**
  - the pass runs in `run_health_maintenance` before Recommended;
  - there is one model call per agent;
  - the registry;
  - the locks (action, then recommendation);
  - expiry rules and budget accounting.
- **`05-backend-schema.md`:** `AgentAction` (the renamed `Proposal`), `AgentProfile`, `AgentPolicy`, Recommendation's `agent_action`, and the notification kind.
- **`06-implementation-plan.md`:** Agents delivery 1 is done.

- [ ] **Step 3: Format the plan docs, then run every check**

Run:
```bash
venv/bin/ruff format docs/superpowers/plans/2026-10-08-agents-actions-backend.md docs/superpowers/plans/2026-10-08-agents-actions-api.md
venv/bin/python manage.py makemigrations --check --dry-run
venv/bin/ruff check .
venv/bin/ruff format --check .
venv/bin/python manage.py test --parallel auto --noinput
```
Expected: no changes detected; lint clean; every test OK.

- [ ] **Step 4: Apply the migrations to the local dev DB**

Run: `venv/bin/python manage.py migrate`
Expected: applies `metrics 0011`, `agents 0001`, `notifications 0010` and `work 0004`.

- [ ] **Step 5: Commit**

```bash
git add services/agents/tests docs
git commit -m "docs: Agents delivery 1, the action layer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Self-review

- **Spec coverage:**

  | Spec section | Task(s) |
  |---|---|
  | §1.1 | 2, 5 |
  | §1.2 | 5, 7 |
  | §1.3 | 1, 3, 4 |
  | §1.4 | 6, 9, 10 |
  | §1.5 | 8, 9 |
  | §1.6 | 2, 9 |
  | §1.7 | 2, 7, 9 |
  | §1.8 | the frontend plan |
  | §4 privacy | 9, 10, 12 |
  | §5 edge cases | 4, 6, 7, 8 |
  | §6 testing | every task, plus 12 |
  | Proposal migration | 1, 10, 11 |

- **Names used across tasks:**
  - from `kinds`: `AUTO`, `ASK`, `NEVER`, `RANK`, `Kind`, `Invalid`, `Stale`, `ChangedSince`
  - from `policy`: `profiles_for`, `policy_for`, `level`, `grid`, `spent_this_month`, `resets_on`, `plan_credits`, `AGENTS`, `LABELS`
  - `registry.REGISTRY`, `registry.kinds_for`
  - `evidence.Context`, `evidence.build`, `evidence.book`
  - `prompt.system`, `prompt.render`, `prompt.parse`, `prompt.MAX_ACTIONS`
  - from `deciding`: `decided_as`, `approve`, `reject`, `reject_locked`, `apply_action`, `expire`, `stale_reason`, `locked`, `REASONS`, `WAIT`, `AlreadyDecided`, `Expired`, `CantDecide`
  - from `undo`: `undo`, `NotApplied`, `UndoExpired`, `undo_window`
  - from `payloads`: `action_payload`, `card`
  - `run.run`, `run.run_all`, `run.skip_reason`, `run.RunResult`
  - from `work`: `recommend.settle_for_action`, `refresh(kinds=)`, `deciding.UseApply`
  - `desk.agent_actions`
- **Known fix-ups flagged inline:**
  - Task 3 keeps one skip until Task 4.
  - Task 7's account test name.
  - Task 10's fixture choice (`RecommendFixture` only).
  - Task 9 refers to `Recommendation.Kind.AGENT` until Task 10.
