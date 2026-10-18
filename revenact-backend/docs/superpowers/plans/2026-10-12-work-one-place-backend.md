# Work in one place, delivery 1 (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Personal to-dos on `customers.Task`, `POST /work/todos/`, and the one feed (`GET /work/feed/`, its paging and `GET /work/feed/count/`) composed over the existing sources, with the tracking, agents and digest guards for to-dos.

**Architecture:** A to-do is a `Task` with no record. `personal.visible_tasks` drops every to-do, and a new `task_access.readable_tasks` adds the reader's own to-dos for the task panel, the feed and the digest only. The feed is four small modules in `services/work/`: `feed_shape` (kinds, groups, item shape, keyset cursor; no queries), `feed_tasks` (tasks and to-dos in six date groups), `feed_decide` (Brain's desk sources plus the reader's reply drafts), `feed_suggest` (four recommendation kinds), orchestrated by `feed.py`, where each source runs in its own savepoint and a failure only adds its kinds to `failed`.

**Tech Stack:** Python 3.13, Django 5.2, DRF 3.18, Postgres 16 (CI/prod; local may be 15). Tests: `django.test`, `rest_framework.test`, `LiveServerTestCase` + `e2e/http.py`.

**Spec:** react-ts-app `docs/superpowers/specs/2026-10-12-work-one-place-design.md` (§3, §4.1, §4.2; delivery 1 of §8). **Binding contract:** `docs/superpowers/plans/2026-10-12-work-one-place-api.md` (this repo). Read both before any task; the contract's Decisions table is part of the requirements.

## Global Constraints

- Work only in `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-one-be` on branch `feat/work-one-place`.
- Run tests as `venv/bin/python manage.py test <labels> --parallel auto --noinput`. Never the whole suite serially.
- Lint before each commit: `venv/bin/ruff check . && venv/bin/ruff format --check .` (CI runs both; `ruff format` also formats Markdown code blocks it understands, so run `venv/bin/ruff format .` if the check fails).
- Every commit message ends with exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`; conventional commits (`feat(work): ...`, `fix(customers): ...`, `docs: ...`, `test(...)`).
- Postgres 16: no visibility rule may be a join made unique with `DISTINCT`; use `id IN (subquery)`. Query counts are pinned in tests.
- Every visibility filter carries a `# SOC2:AUTH-02 ...` comment in the house style; every write that is audited keeps `# SOC2:LOG-01`.
- User-facing sentences are exactly the contract's. New ones:
  - `"A to-do without a record can only be yours."`
  - `"Choose an organisation or account you can open."`
  - `"Choose an organisation or an account, not both."`
  - `"A task's organisation or account can't be changed."`
  - `"Choose approval, rule_review, question, draft, task, todo or suggestion."`
  - `"Choose decide, overdue, today, week, later, no_date, blocked or suggested."`
  - `"Say which group to page."`
  - `"That list has changed. Reload Work."`
- Not in this delivery: `/work/feed/team/`, retiring recommendation kinds, removing `/brain/waiting/*` or `/work/today/`. Do not touch them beyond what a task says.
- No new dependency.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `services/customers/models.py` | modify | `Task`: at most one record, `due_date` nullable, `task_dated_unless_todo`, `__str__` |
| `services/customers/migrations/0061_task_todo.py` | create (makemigrations) | the constraint swap and nullable `due_date` |
| `services/customers/personal.py` | modify | `visible_tasks` drops to-dos |
| `services/customers/task_access.py` | modify | `todo_q`, `is_todo`, `readable_tasks`, `record_for`, new sentences, `editable_fields` with `record` |
| `services/customers/task_payloads.py` | modify | TaskRow/TaskDetail for a to-do (`parent: null`, `private`, `due_date: null`) |
| `services/customers/task_changes.py` | modify | `add_task(parent=None)`, record attach tracked and evented, null-safe dates |
| `services/customers/task_views.py` | modify | the panel reads `readable_tasks`; PATCH: null date, to-do assignee, attach a record |
| `services/customers/serializers.py` | modify | record endpoints keep `due_date` required |
| `services/work/feed_shape.py` | create | kinds, groups, `PAGE`, `parse_kinds`, `item`, `record_ref`, `group`, cursor, `after_q` |
| `services/work/feed_tasks.py` | create | `Tasks` source, `group_q`, `group_of`, `task_item` |
| `services/work/feed_decide.py` | create | `RuleReviews`, `Approvals`, `Questions`, `Drafts`, `MAKERS` |
| `services/work/feed_suggest.py` | create | `Suggestions` |
| `services/work/feed.py` | create | `build`, `page`, `count` with per-source savepoints |
| `services/work/todos.py` | create | `TodoSerializer`, `create`, `created_payload` |
| `services/work/views.py`, `services/work/urls.py` | modify | `FeedView`, `FeedCountView`, `TodoCreateView` |
| `services/work/digest.py` | modify | counts and names through `feed_tasks.Tasks` (own to-dos included) |
| `services/work/tracking.py` | modify | explicit `due_date__isnull=False` |
| tests | create/modify | listed per task |
| `e2e/test_work_one_place_flow.py` | create | the journey |
| docs | modify | Task 12 |

---

### Task 1: Task model: at most one record, optional date for to-dos

**Files:**
- Modify: `services/customers/models.py` (class `Task`, ~L1333–1505)
- Create: `services/customers/migrations/0061_task_todo.py` (generated)
- Modify: `services/customers/tests/test_models.py` (`TaskParentConstraintTests`, ~L236)
- Create: `services/customers/tests/test_task_todo_migration.py`

**Interfaces:**
- Produces: DB constraints `task_at_most_one_parent` and `task_dated_unless_todo`; `Task.due_date` nullable. A `Task` with `customer_id is None and account_id is None` is a to-do.

- [ ] **Step 1: Write the failing tests**

In `services/customers/tests/test_models.py`, replace the class docstring and `test_neither_parent_is_rejected` of `TaskParentConstraintTests`, and add the tests below it:

```python
class TaskParentConstraintTests(TestCase):
    """At most one parent (Work in one place §3): an organisation's or an
    account's task, or, with neither, a to-do. Only a to-do may have no date."""

    # setUp and _task_kwargs unchanged

    def test_neither_parent_makes_a_to_do(self):
        task = Task.objects.create(**self._task_kwargs())
        self.assertIsNone(task.customer_id)
        self.assertIsNone(task.account_id)

    def test_a_to_do_may_have_no_date(self):
        task = Task.objects.create(**{**self._task_kwargs(), "due_date": None})
        self.assertIsNone(Task.objects.get(pk=task.pk).due_date)

    def test_a_task_on_a_record_must_have_a_date(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Task.objects.create(customer=self.customer, **{**self._task_kwargs(), "due_date": None})
        with self.assertRaises(IntegrityError), transaction.atomic():
            Task.objects.create(account=self.account, **{**self._task_kwargs(), "due_date": None})

    def test_a_to_do_reads_as_its_title(self):
        self.assertEqual(str(Task.objects.create(**self._task_kwargs())), "Prepare QBR deck")
        task = Task.objects.create(customer=self.customer, **self._task_kwargs())
        self.assertEqual(str(task), "Prepare QBR deck — Some Co")
```

Create `services/customers/tests/test_task_todo_migration.py`:

```python
"""0061 only loosens the parent rule and the date: every existing task keeps
its record and its date, and two records are still refused."""

from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase

BEFORE = [("customers", "0060_reply_draft_sending")]
AFTER = [("customers", "0061_task_todo")]


class TaskTodoMigrationTests(TransactionTestCase):
    def test_existing_tasks_keep_exactly_one_record(self):
        executor = MigrationExecutor(connection)
        executor.migrate(BEFORE)
        old = executor.loader.project_state(BEFORE).apps
        Organisation = old.get_model("accounts", "Organisation")
        Customer = old.get_model("customers", "Customer")
        Account = old.get_model("customers", "Account")
        Task = old.get_model("customers", "Task")
        org = Organisation.objects.create(name="Acme", currency="USD")
        pizza = Customer.objects.create(organisation=org, name="Pizza Hut")
        emea = Account.objects.create(name="Pizza EMEA")
        common = {"assignee_name": "Carl", "due_date": "2026-10-12", "priority": "high"}
        on_customer = Task.objects.create(customer=pizza, title="Call", **common)
        on_account = Task.objects.create(account=emea, title="Sync", **common)

        executor.loader.build_graph()
        executor.migrate(AFTER)
        new = executor.loader.project_state(AFTER).apps
        Task = new.get_model("customers", "Task")
        rows = {t.pk: (t.customer_id, t.account_id, str(t.due_date)) for t in Task.objects.all()}
        self.assertEqual(
            rows,
            {
                on_customer.pk: (pizza.pk, None, "2026-10-12"),
                on_account.pk: (None, emea.pk, "2026-10-12"),
            },
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            Task.objects.create(customer_id=pizza.pk, account_id=emea.pk, title="Both", **common)

        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())
```

- [ ] **Step 2: Run them to verify they fail**

Run: `venv/bin/python manage.py test services.customers.tests.test_models.TaskParentConstraintTests services.customers.tests.test_task_todo_migration --parallel auto --noinput`
Expected: FAIL — `test_neither_parent_makes_a_to_do` raises IntegrityError (`task_belongs_to_exactly_one_parent`); the migration test fails with `NodeNotFoundError` for `0061_task_todo`.

- [ ] **Step 3: Change the model**

In `services/customers/models.py`, `class Task`:

Replace the first paragraph of the docstring with:

```python
    """A CSM to-do item — on at most one of Customer or Account. With
    neither it is a **to-do**: private to its creator (`created_by`), always
    assigned to them, read only through `task_access.readable_tasks`
    (Work in one place §3). Only a to-do may have no `due_date`
    (`task_dated_unless_todo`), so every reader of a task on a record keeps
    its date.
```

(keep the rest of the docstring from "Mirrors the frontend's mock TaskItem shape" on).

Change the two `help_text`s and `due_date`:

```python
    customer = models.ForeignKey(
        Customer,
        related_name="tasks",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="Set for an organization-level task. At most one of customer/account is "
        "set; with neither the task is a to-do (see the model's docstring).",
    )
    account = models.ForeignKey(
        Account,
        related_name="tasks",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="Set for an account-level task. At most one of customer/account is "
        "set; with neither the task is a to-do (see the model's docstring).",
    )
```

```python
    due_date = models.DateField(
        null=True,
        blank=True,
        help_text="Only a to-do may have none (the task_dated_unless_todo constraint).",
    )
```

Replace the first `CheckConstraint` (`task_belongs_to_exactly_one_parent`) with these two:

```python
(
    models.CheckConstraint(
        condition=~models.Q(customer__isnull=False, account__isnull=False),
        name="task_at_most_one_parent",
    ),
)
(
    models.CheckConstraint(
        condition=models.Q(due_date__isnull=False)
        | models.Q(customer__isnull=True, account__isnull=True),
        name="task_dated_unless_todo",
    ),
)
```

Replace `__str__`:

```python
    def __str__(self):
        parent = self.customer or self.account
        return self.title if parent is None else f"{self.title} — {parent}"
```

- [ ] **Step 4: Generate the migration**

Run: `venv/bin/python manage.py makemigrations customers --name task_todo`
Expected: `services/customers/migrations/0061_task_todo.py` with exactly these operations (order may differ): `RemoveConstraint(model_name="task", name="task_belongs_to_exactly_one_parent")`, `AlterField` for `account`, `customer` (help text) and `due_date` (`null=True, blank=True`), `AddConstraint` `task_at_most_one_parent`, `AddConstraint` `task_dated_unless_todo`. Open the file and confirm there is no other model in it. Then `venv/bin/python manage.py makemigrations --check --dry-run` prints `No changes detected`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.customers.tests.test_models services.customers.tests.test_task_todo_migration services.customers.tests.test_task_model --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/customers/models.py services/customers/migrations/0061_task_todo.py services/customers/tests/test_models.py services/customers/tests/test_task_todo_migration.py
git commit -m "feat(customers): a task with no record is a to-do; only a to-do may be dateless

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: To-dos are their creator's alone

**Files:**
- Modify: `services/customers/personal.py` (`visible_tasks`)
- Modify: `services/customers/task_access.py`
- Create: `services/customers/tests/test_todo_privacy.py`

**Interfaces:**
- Consumes: Task 1's model.
- Produces (in `services.customers.task_access`):
  - `todo_q(user) -> Q` — the user's own to-dos.
  - `is_todo(task) -> bool`.
  - `readable_tasks(user, queryset) -> QuerySet` — `openable_tasks` plus the user's own to-dos.
  - `visible_tasks(user, queryset)` (in `personal`) never returns a to-do.

- [ ] **Step 1: Write the failing tests**

Create `services/customers/tests/test_todo_privacy.py`:

```python
"""A to-do is its creator's alone (Work in one place §3): only
`readable_tasks` reads it, and only for its creator. Every other rule and
every existing list reads exactly what it read before the to-do existed."""

from datetime import timedelta

from services.accounts.models import User
from services.copilot.views import _task_rule
from services.customers.models import Task
from services.customers.personal import visible_tasks
from services.customers.task_access import is_todo, openable_tasks, readable_tasks, todo_q
from services.work.tests.fixtures import WorkFixture


class TodoPrivacyTests(WorkFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.todo = Task.objects.create(
            title="Renew my passport",
            assignee=cls.csm,
            assignee_name=cls.csm.name,
            created_by=cls.csm,
            due_date=cls.today - timedelta(days=1),
            priority="high",
        )

    def fresh(self, user):
        return User.objects.get(pk=user.pk)

    def test_only_its_creator_reads_a_to_do(self):
        expected = {self.csm: True, self.mona: False, self.admin: False, self.lee: False}
        for reader, found in expected.items():
            rows = readable_tasks(self.fresh(reader), Task.objects.filter(pk=self.todo.pk))
            self.assertEqual(rows.exists(), found, reader.name)

    def test_every_other_task_is_read_as_the_twice_filter_reads_it(self):
        others = Task.objects.exclude(pk=self.todo.pk)
        for reader in (self.csm, self.mona, self.admin, self.lee):
            reader = self.fresh(reader)
            self.assertEqual(
                set(readable_tasks(reader, others)), set(openable_tasks(reader, others))
            )

    def test_no_other_rule_reads_a_to_do_not_even_for_its_creator(self):
        _model, copilot_rule = _task_rule()
        for reader in (self.csm, self.mona, self.admin, self.lee):
            reader = self.fresh(reader)
            for rule in (visible_tasks, openable_tasks, copilot_rule):
                self.assertNotIn(self.todo, rule(reader, Task.objects.all()), reader.name)

    def test_is_todo_and_todo_q(self):
        self.assertTrue(is_todo(self.todo))
        self.assertFalse(is_todo(self.overdue))
        self.assertEqual(list(Task.objects.filter(todo_q(self.csm))), [self.todo])
        self.assertFalse(Task.objects.filter(todo_q(self.mona)).exists())

    def test_no_existing_list_shows_or_counts_a_to_do(self):
        named = (
            "/api/v1/tasks/",
            "/api/v1/tasks/?mine=true",
            f"/api/v1/customers/{self.pizza.pk}/tasks/",
            "/api/v1/brain/graph/?scope=me",
        )
        # Lists whose counts would move with an overdue to-do: compared whole.
        counted = (
            "/api/v1/work/today/",
            "/api/v1/work/team/",
            f"/api/v1/work/tasks/?assignee={self.csm.pk}&state=overdue",
            "/api/v1/brain/waiting/?scope=me",
            "/api/v1/brain/waiting/count/",
        )
        readers = (self.csm, self.mona, self.admin, self.lee)

        def read(urls):
            return {
                (r.pk, url): self.as_user(self.fresh(r)).get(url).content
                for r in readers
                for url in urls
            }

        with_todo = read(named + counted)
        for key, body in with_todo.items():
            self.assertNotIn(b"Renew my passport", body, key)
        Task.objects.filter(pk=self.todo.pk).delete()
        without = read(counted)
        for key, body in without.items():
            self.assertEqual(with_todo[key], body, key)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `venv/bin/python manage.py test services.customers.tests.test_todo_privacy --parallel auto --noinput`
Expected: FAIL — `ImportError: cannot import name 'is_todo' from 'services.customers.task_access'`.

- [ ] **Step 3: `visible_tasks` drops to-dos**

In `services/customers/personal.py`, `visible_tasks`, add one paragraph to the docstring and the first filter:

```python
def visible_tasks(user, queryset):
    """A task is the creator's and the assignee's: either of them, or anyone
    above either, may read it. A reader with view_all_accounts or the
    Leadership function reads every task (owner decision 2026-10-07). A task
    with neither creator nor assignee (seeded) is everyone's. Callers always
    add the record rule: nobody reads a task on a record they cannot open.

    A to-do (no record) is never read through this rule, not even by its
    creator: only `task_access.readable_tasks` reads it, for its creator
    alone (Work in one place §3). So no record list, Brain, Copilot, agent
    or export that reads tasks through here can show one."""
    from django.db.models import Q

    from services.accounts.hierarchy import subtree_ids
    from services.accounts.models import User

    from .scoping import sees_everything

    # SOC2:AUTH-02 a to-do is its creator's alone, read only through task_access.readable_tasks
    queryset = queryset.filter(Q(customer__isnull=False) | Q(account__isnull=False))
    # SOC2:AUTH-02 view-all and Leadership read every task; the record rule still applies
    if sees_everything(user) or getattr(user, "function", None) == User.Function.LEADERSHIP:
        return queryset
    mine = {user.id, *subtree_ids(user)}
    # SOC2:AUTH-02 object-level rule for personal tasks
    return queryset.filter(
        Q(created_by__isnull=True, assignee__isnull=True)
        | Q(created_by_id__in=mine)
        | Q(assignee_id__in=mine)
    )
```

- [ ] **Step 4: `todo_q`, `is_todo`, `readable_tasks`**

In `services/customers/task_access.py`, add `**To-dos**` to the module docstring (after the "Given" paragraph):

```
**To-dos** (Work in one place §3): a task with no record is its creator's
alone. `visible_tasks` never returns one; `readable_tasks` is
`openable_tasks` plus the reader's own to-dos, and is what the task panel,
the feed and the digest read.
```

Change the model import to `from .models import Customer, Task` and add after `openable_tasks`:

```python
def todo_q(user):
    """`user`'s own to-dos: tasks with no record that they made."""
    return Q(customer__isnull=True, account__isnull=True, created_by_id=user.pk)


def is_todo(task):
    return task.customer_id is None and task.account_id is None


def readable_tasks(user, queryset):
    """`queryset` cut to the tasks `user` may read: the twice-filter, plus
    their own to-dos. `id IN` subqueries, no DISTINCT (Postgres 16)."""
    openable = openable_tasks(user, Task.objects.all()).values("id")
    # SOC2:AUTH-02 a to-do is its creator's alone; every other task passes the twice-filter
    return queryset.filter(Q(id__in=openable) | todo_q(user))
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.customers.tests.test_todo_privacy services.customers services.work services.brain --parallel auto --noinput`
Expected: PASS (the wider labels prove no existing reader changed).

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/customers/personal.py services/customers/task_access.py services/customers/tests/test_todo_privacy.py
git commit -m "feat(customers): a to-do is read only by its creator, through readable_tasks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The task panel for to-dos (read, edit, attach a record)

**Files:**
- Modify: `services/customers/task_access.py` (sentences, `record_for`, `editable_fields`)
- Modify: `services/customers/task_payloads.py`
- Modify: `services/customers/task_changes.py`
- Modify: `services/customers/task_views.py`
- Modify: `services/customers/serializers.py` (`TaskSerializer.due_date`)
- Modify: `services/work/tests/test_today.py` (~L37–51: the exact row gains `"private": False`)
- Create: `services/customers/tests/test_todo_panel.py`

**Interfaces:**
- Consumes: `is_todo`, `readable_tasks`, `todo_q` (Task 2).
- Produces (in `services.customers.task_access`):
  - `TODO_ONLY_YOURS`, `RECORD_YOU_CAN_OPEN`, `ONE_RECORD`, `RECORD_FIXED` (the contract's sentences).
  - `record_for(user, customer_id, account_id) -> Customer | Account | None`, raising `ValidationError({"record": [...]})`.
  - `editable_fields(user, task)` contains `"record"` exactly for a to-do.
- Produces (in `services.customers.task_changes`): `add_task(parent=None, ...)` makes a to-do; `changed_fields` reports `"record"`; `record_changes` writes `{"field": "record", "from": None, "to": {...}}`.
- Produces (in `services.customers.task_payloads`): `task_row(task)` has `private`; `parent: None` and `due_date: None` for a to-do.

- [ ] **Step 1: Write the failing tests**

Create `services/customers/tests/test_todo_panel.py`:

```python
"""The task panel on a to-do (contract §1.2, §1.3): its creator reads,
edits, ticks and comments on it; nobody else finds it. A record may be
attached (it then lives by record rules); never changed or removed."""

from datetime import timedelta

from services.accounts.models import User
from services.customers.models import Task, TaskEvent
from services.work.tests.fixtures import WorkFixture

ONLY_YOURS = "A to-do without a record can only be yours."
OPENABLE = "Choose an organisation or account you can open."


class TodoPanelTests(WorkFixture):
    def setUp(self):
        self.todo = Task.objects.create(
            title="Book the QBR room",
            assignee=self.csm,
            assignee_name=self.csm.name,
            created_by=self.csm,
            due_date=None,
            priority="medium",
        )
        self.url = f"/api/v1/tasks/{self.todo.pk}/"

    def client_for(self, user):
        return self.as_user(User.objects.get(pk=user.pk))

    def patch(self, body, user=None):
        return self.client_for(user or self.csm).patch(self.url, body, format="json")

    def test_its_creator_reads_it_as_a_private_task_with_no_record(self):
        body = self.client_for(self.csm).get(self.url).json()
        self.assertEqual(
            (body["parent"], body["parent_name"], body["parent_type"], body["due_date"]),
            (None, None, None, None),
        )
        self.assertTrue(body["private"])
        self.assertEqual(
            body["editable"],
            ["title", "description", "status", "due_date", "priority", "assignee", "record"],
        )

    def test_nobody_else_finds_it(self):
        for user in (self.mona, self.admin, self.lee, self.other):
            client = self.client_for(user)
            self.assertEqual(client.get(self.url).status_code, 404, user.name)
            self.assertEqual(client.patch(self.url, {"title": "x"}, format="json").status_code, 404)
            comment = client.post(f"{self.url}comments/", {"body": "hi"}, format="json")
            self.assertEqual(comment.status_code, 404)

    def test_done_and_undone(self):
        response = self.patch({"status": "completed"})
        self.assertEqual((response.status_code, response.json()["status"]), (200, "completed"))
        self.assertEqual(self.patch({"status": "pending"}).json()["status"], "pending")

    def test_a_date_can_be_set_and_cleared(self):
        day = (self.today + timedelta(days=3)).isoformat()
        self.assertEqual(self.patch({"due_date": day}).json()["due_date"], day)
        self.assertIsNone(self.patch({"due_date": None}).json()["due_date"])
        event = TaskEvent.objects.filter(task=self.todo, kind="due_changed").last()
        self.assertEqual(event.data, {"from": day, "to": None})

    def test_a_task_on_a_record_keeps_its_date(self):
        response = self.client_for(self.csm).patch(
            f"/api/v1/tasks/{self.overdue.pk}/", {"due_date": None}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"due_date": ["Choose a date."]})

    def test_a_to_do_is_only_ever_its_creators(self):
        response = self.patch({"assignee_id": self.mona.pk})
        self.assertEqual((response.status_code, response.json()), (400, {"assignee": [ONLY_YOURS]}))
        self.assertEqual(self.patch({"assignee_id": self.csm.pk}).status_code, 200)

    def test_attaching_a_record_makes_it_an_ordinary_task(self):
        day = self.today.isoformat()
        response = self.patch({"customer_id": self.pizza.pk, "due_date": day})
        self.assertEqual(response.status_code, 200, response.json())
        body = response.json()
        self.assertEqual(
            body["parent"], {"kind": "customer", "id": self.pizza.pk, "name": "Pizza Hut"}
        )
        self.assertFalse(body["private"])
        self.assertNotIn("record", body["editable"])
        event = TaskEvent.objects.get(task=self.todo, kind="edited", data__field="record")
        self.assertEqual(
            event.data,
            {
                "field": "record",
                "from": None,
                "to": {"kind": "customer", "id": self.pizza.pk, "name": "Pizza Hut"},
            },
        )
        # Record rules now: Carl's manager reads it.
        self.assertEqual(self.client_for(self.mona).get(self.url).status_code, 200)

    def test_attaching_needs_a_date_an_openable_record_and_only_one(self):
        cases = (
            ({"customer_id": self.pizza.pk}, {"due_date": ["Choose a date."]}),
            (
                {"account_id": self.west.pk, "due_date": self.today.isoformat()},
                {"record": [OPENABLE]},
            ),
            ({"customer_id": 999_999, "due_date": self.today.isoformat()}, {"record": [OPENABLE]}),
            (
                {
                    "customer_id": self.pizza.pk,
                    "account_id": self.emea.pk,
                    "due_date": self.today.isoformat(),
                },
                {"record": ["Choose an organisation or an account, not both."]},
            ),
            ({"customer_id": "pizza"}, {"customer_id": [OPENABLE]}),
        )
        for body, error in cases:
            response = self.patch(body)
            self.assertEqual((response.status_code, response.json()), (400, error), body)
        self.assertTrue(Task.objects.filter(pk=self.todo.pk, customer__isnull=True).exists())

    def test_attaching_checks_a_new_assignee_against_the_record(self):
        response = self.patch(
            {
                "customer_id": self.pizza.pk,
                "due_date": self.today.isoformat(),
                "assignee_id": self.other.pk,
            }
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "ASSIGNEE_CANNOT_OPEN")

    def test_a_tasks_record_never_changes(self):
        url = f"/api/v1/tasks/{self.overdue.pk}/"
        client = self.client_for(self.csm)
        moved = client.patch(url, {"customer_id": self.dough.pk}, format="json")
        self.assertEqual(
            (moved.status_code, moved.json()),
            (400, {"record": ["A task's organisation or account can't be changed."]}),
        )
        same = client.patch(url, {"customer_id": self.pizza.pk, "account_id": None}, format="json")
        self.assertEqual(same.status_code, 200)

    def test_its_creator_comments_on_it(self):
        response = self.client_for(self.csm).post(
            f"{self.url}comments/", {"body": "Room 4"}, format="json"
        )
        self.assertEqual(response.status_code, 201)

    def test_record_endpoints_still_need_a_date(self):
        response = self.client_for(self.csm).post(
            f"/api/v1/customers/{self.pizza.pk}/tasks/",
            {"title": "Call", "priority": "high"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("due_date", response.json())
```

In `services/work/tests/test_today.py` (the exact row, ~L39–50), add `"private": False,` after `"plan": None,`.

- [ ] **Step 2: Run them to verify they fail**

Run: `venv/bin/python manage.py test services.customers.tests.test_todo_panel services.work.tests.test_today --parallel auto --noinput`
Expected: FAIL — the to-do GET is 404 (the panel reads `openable_tasks`); `private` missing.

- [ ] **Step 3: Sentences, `record_for`, `editable_fields` in `task_access.py`**

Add after `STATUS_ONLY = ("status",)`:

```python
TODO_ONLY_YOURS = "A to-do without a record can only be yours."
RECORD_YOU_CAN_OPEN = "Choose an organisation or account you can open."
ONE_RECORD = "Choose an organisation or an account, not both."
RECORD_FIXED = "A task's organisation or account can't be changed."
```

Add after `assignee_for`:

```python
def record_for(user, customer_id, account_id):
    """The organisation or account a body names, which `user` must be able
    to open; None when it names neither. A missing record and one the caller
    cannot open read the same."""
    if customer_id is not None and account_id is not None:
        raise ValidationError({"record": [ONE_RECORD]})
    if customer_id is not None:
        record = visible_customers(user).filter(pk=customer_id).first()
    elif account_id is not None:
        record = visible_accounts(user).filter(pk=account_id).first()
    else:
        return None
    # SOC2:AUTH-02 a task goes only on a record its maker may open
    if record is None:
        raise ValidationError({"record": [RECORD_YOU_CAN_OPEN]})
    return record
```

Change `editable_fields`' first lines:

```python
def editable_fields(user, task):
    """The fields `user` may change on a task they can read (see the module).
    A to-do also takes a record (attaching one); no other task does."""
    if is_todo(task):
        return [*FIELDS, "record"]
    if task.plan_id is None:
        return list(FIELDS)
```

- [ ] **Step 4: Payloads**

In `services/customers/task_payloads.py`, change the import to `from .task_access import editable_fields, is_todo, record_of`, and:

```python
def parent_payload(task):
    record = record_of(task)
    if record is None:
        return None
    kind = "customer" if isinstance(record, Customer) else "account"
    return {"kind": kind, "id": record.pk, "name": record.name}
```

In `task_row`:

```python
        "due_date": None if task.due_date is None else task.due_date.isoformat(),
```

and add after `"plan": ...`:

```python
        # A to-do: its creator's alone ("Only you").
        "private": is_todo(task),
```

In `task_detail`:

```python
        "parent_name": None if row["parent"] is None else row["parent"]["name"],
        "parent_type": None if row["parent"] is None else row["parent"]["kind"],
```

- [ ] **Step 5: Task writes**

In `services/customers/task_changes.py`:

`notify_assigned`, right after `record = record_of(task)`:

```python
    if record is None:
        # A to-do is always its maker's own: nobody to tell.
        return None
```

`add_task`: update the docstring's first line to `"""A task on `parent` (a Customer or an Account), or a to-do when `parent` is None. ...` and the first statement:

```python
    if parent is None:
        on = {}
    else:
        on = {"customer": parent} if isinstance(parent, Customer) else {"account": parent}
```

`TRACKED` gains the record:

```python
TRACKED = (
    "title",
    "description",
    "priority",
    "due_date",
    "assignee_id",
    "status",
    "blocked_reason",
    "customer_id",
    "account_id",
)
```

`changed_fields` — add before `return names`:

```python
    if (task.customer_id, task.account_id) != (before["customer_id"], before["account_id"]):
        names.append("record")
```

Add helpers above `record_changes`:

```python
def _day(value):
    return None if value is None else value.isoformat()


def _record(task):
    record = record_of(task)
    kind = "customer" if isinstance(record, Customer) else "account"
    return {"kind": kind, "id": record.pk, "name": record.name}
```

In `record_changes`, replace the `due_date` block and add the record event after it:

```python
    if "due_date" in names:
        dates = {"from": _day(before["due_date"]), "to": _day(task.due_date)}
        events.append(_event(task, actor, kind.DUE_CHANGED, dates))
    if "record" in names:
        # Only a to-do takes a record, once: there is never one to come from.
        events.append(
            _event(task, actor, kind.EDITED, {"field": "record", "from": None, "to": _record(task)})
        )
```

- [ ] **Step 6: The panel's routes**

In `services/customers/task_views.py`:

Imports:

```python
from .models import Customer, Task, TaskEvent
from .task_access import (
    RECORD_FIXED,
    RECORD_YOU_CAN_OPEN,
    SAY_WHY_BLOCKED,
    TODO_ONLY_YOURS,
    assignee_for,
    editable_fields,
    is_todo,
    readable_tasks,
    record_for,
    record_of,
)
```

Module docstring: add one sentence: `A to-do is read only by its creator (task_access.readable_tasks).`

`TaskPatchSerializer`: replace `due_date` and add the two record ids:

```python
    due_date = serializers.DateField(
        required=False,
        allow_null=True,
        error_messages={"invalid": CHOOSE_DATE, "datetime": CHOOSE_DATE},
    )
    customer_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        error_messages={"invalid": RECORD_YOU_CAN_OPEN, "max_string_length": RECORD_YOU_CAN_OPEN},
    )
    account_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        error_messages={"invalid": RECORD_YOU_CAN_OPEN, "max_string_length": RECORD_YOU_CAN_OPEN},
    )
```

`_readable` and `_as_saved`: replace both uses of `openable_tasks(` with `readable_tasks(` (the `# SOC2:AUTH-02` comment in `_readable` becomes `# SOC2:AUTH-02 the twice-filter, or the reader's own to-do; anything else reads as missing`).

`_asked`: add after the `assignee_id` check:

```python
    if any(
        data.get(name) is not None and data[name] != getattr(task, name)
        for name in ("customer_id", "account_id")
    ):
        asked.add("record")
```

`_values` takes `asked` and handles the record, the date rule and a to-do's assignee:

```python
def _values(user, task, data, asked):
    """The validated body as the values to write: the record looked up and
    checked (a to-do's only), the assignee looked up and checked, and the
    status with its reason (required for Blocked, cleared otherwise). A task
    with a record always keeps a date."""
    values = {n: data[n] for n in ("title", "description", "priority", "due_date") if n in data}
    record = None
    if "record" in asked:
        record = record_for(user, data.get("customer_id"), data.get("account_id"))
        values["record"] = record
    target = record if record is not None else record_of(task)
    if target is not None and values.get("due_date", task.due_date) is None:
        raise ValidationError({"due_date": [CHOOSE_DATE]})
    if "assignee_id" in data and data["assignee_id"] != task.assignee_id:
        if target is None:
            # SOC2:AUTH-02 a to-do is its creator's alone
            raise ValidationError({"assignee": [TODO_ONLY_YOURS]})
        values["assignee"] = assignee_for(user.organisation_id, data["assignee_id"], target)
    new_status = data.get("status", task.status)
    if new_status == Task.Status.BLOCKED:
        sent = "blocked_reason" in data
        reason = (data["blocked_reason"] or "").strip() if sent else task.blocked_reason
        if not reason:
            raise ValidationError({"blocked_reason": [SAY_WHY_BLOCKED]})
    else:
        reason = ""
    values["status"], values["blocked_reason"] = new_status, reason
    return values
```

`TaskDetailView.patch`, inside the transaction:

```python
        with transaction.atomic():
            task = _locked(request.user, pk)
            asked = _asked(task, data)
            if "record" in asked and not is_todo(task):
                raise ValidationError({"record": [RECORD_FIXED]})
            if not asked <= set(editable_fields(request.user, task)):
                _refuse(request.user, task, asked)
            self._write(request, task, _values(request.user, task, data, asked))
```

`TaskDetailView._write`: after the `for name in (...)` loop, add:

```python
        if "record" in values:
            record = values["record"]
            if isinstance(record, Customer):
                task.customer, task.account = record, None
            else:
                task.customer, task.account = None, record
```

and replace the `saved = [...]` line with:

```python
        kept = [n for n in names if task.plan_id is None or n not in ("status", "blocked_reason")]
        # "record" is the API's name for the two parent columns.
        saved = [f for n in kept for f in (("customer", "account") if n == "record" else (n,))]
```

Update the class docstring's field list: `PATCH any of title, description, status (with blocked_reason), due_date, priority, assignee_id; on a to-do also customer_id or account_id (attach a record)`.

- [ ] **Step 7: Record endpoints keep a required date**

In `services/customers/serializers.py`, `TaskSerializer`, add next to `description`:

```python
    # The model allows no date only for a to-do; a record's task always has one.
    due_date = serializers.DateField()
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.customers services.work services.plans services.agents --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/customers/task_access.py services/customers/task_payloads.py services/customers/task_changes.py services/customers/task_views.py services/customers/serializers.py services/customers/tests/test_todo_panel.py services/work/tests/test_today.py
git commit -m "feat(customers): the task panel reads, edits and attaches a record to a to-do

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The feed's shape: kinds, groups, items, the keyset cursor

**Files:**
- Create: `services/work/feed_shape.py`
- Create: `services/work/tests/test_feed_shape.py`

**Interfaces:**
- Produces (all in `services.work.feed_shape`):
  - Constants `PAGE = 50`; kinds `APPROVAL, RULE_REVIEW, QUESTION, DRAFT, TASK, TODO, SUGGESTION`; `KINDS` (that order); `DECIDE_KINDS = (RULE_REVIEW, APPROVAL, QUESTION, DRAFT)`; groups `DECIDE = "decide"`, `TASK_GROUPS = ("overdue", "today", "week", "later", "no_date", "blocked")`, `SUGGESTED = "suggested"`, `GROUPS`.
  - Sentences `CHOOSE_KIND`, `CHOOSE_GROUP`, `CURSOR_NEEDS_GROUP`, `STALE_CURSOR`.
  - `class BadQuery(Exception)` with `.field`, `.message`.
  - `parse_kinds(raw: str | None) -> frozenset[str]`.
  - `record_ref(record) -> {"type", "id", "name"}`.
  - `item(*, key, kind, pk, title, record, source, at, actions, detail, due_date=None, priority=None, private=False) -> dict` (the FeedItem).
  - `group(key, count, rows) -> dict` where `rows` is an ordered list of `(sort_key_tuple, item)`.
  - `encode(group_key, values: tuple) -> str`; `decode(group_key, token) -> tuple` (raises `BadQuery("cursor", STALE_CURSOR)`).
  - `after_q(fields, values, *, descending=False) -> Q` (strictly after `values` in `fields` order).

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_feed_shape.py`:

```python
"""The feed's words and shapes, without a database (contract §2)."""

from datetime import UTC, date, datetime

from django.db.models import Q
from django.test import SimpleTestCase

from services.work import feed_shape as fs

AT = datetime(2026, 10, 11, 9, 0, tzinfo=UTC)


class KindFilterTests(SimpleTestCase):
    def test_absent_means_every_kind(self):
        self.assertEqual(fs.parse_kinds(None), frozenset(fs.KINDS))

    def test_a_list(self):
        self.assertEqual(
            fs.parse_kinds("approval, rule_review,approval"), frozenset({"approval", "rule_review"})
        )

    def test_empty_or_unknown_is_refused(self):
        for raw in ("", " , ", "approval,tasks", "overdue_task"):
            with self.assertRaises(fs.BadQuery) as caught:
                fs.parse_kinds(raw)
            self.assertEqual(
                (caught.exception.field, caught.exception.message), ("kind", fs.CHOOSE_KIND)
            )


class CursorTests(SimpleTestCase):
    def test_round_trips_each_groups_position(self):
        for key, values in (
            ("decide", (AT, 1, 41)),
            ("overdue", (date(2026, 10, 1), 0, AT, 7)),
            ("no_date", (date.max, 2, AT, 9)),
            ("suggested", (AT, 3)),
        ):
            token = fs.encode(key, values)
            self.assertRegex(token, r"^[A-Za-z0-9_-]+$")
            self.assertEqual(fs.decode(key, token), values)

    def test_a_cursor_for_another_group_or_of_the_wrong_shape_is_stale(self):
        overdue = fs.encode("overdue", (date(2026, 10, 1), 0, AT, 7))
        for key, token in (
            ("today", overdue),
            ("decide", overdue),
            ("decide", "not-a-cursor"),
            ("decide", ""),
            ("decide", fs.encode("decide", (AT, 1))),
            ("suggested", fs.encode("suggested", (date(2026, 10, 1), 3))),
        ):
            with self.assertRaises(fs.BadQuery) as caught:
                fs.decode(key, token)
            self.assertEqual(caught.exception.message, fs.STALE_CURSOR, (key, token))


class KeysetTests(SimpleTestCase):
    def test_strictly_after_in_order(self):
        self.assertEqual(
            fs.after_q(("a", "b", "c"), (1, 2, 3)),
            Q(a__gt=1) | Q(a=1, b__gt=2) | Q(a=1, b=2, c__gt=3),
        )

    def test_descending(self):
        self.assertEqual(
            fs.after_q(("a", "b"), (1, 2), descending=True), Q(a__lt=1) | Q(a=1, b__lt=2)
        )


class ShapeTests(SimpleTestCase):
    def test_an_item(self):
        entry = fs.item(
            key="task:5",
            kind="todo",
            pk=5,
            title="Book the room",
            record=None,
            source={"type": "person", "label": "Carl CSM"},
            at=AT,
            actions=("done", "open"),
            detail={},
            due_date=date(2026, 10, 14),
            priority="high",
            private=True,
        )
        self.assertEqual(
            entry,
            {
                "key": "task:5",
                "kind": "todo",
                "id": 5,
                "title": "Book the room",
                "record": None,
                "from": {"type": "person", "label": "Carl CSM"},
                "at": "2026-10-11T09:00:00Z",
                "due_date": "2026-10-14",
                "priority": "high",
                "private": True,
                "actions": ["done", "open"],
                "detail": {},
            },
        )

    def test_a_group_pages_at_fifty(self):
        rows = [((AT, 0, n), {"id": n}) for n in range(51)]
        page = fs.group("decide", 80, rows)
        self.assertEqual((page["key"], page["count"], len(page["items"])), ("decide", 80, 50))
        self.assertEqual(fs.decode("decide", page["next"]), (AT, 0, 49))
        self.assertIsNone(fs.group("decide", 50, rows[:50])["next"])
        self.assertEqual(
            fs.group("today", 0, []), {"key": "today", "count": 0, "items": [], "next": None}
        )

    def test_groups_and_kinds_are_in_the_contracts_order(self):
        self.assertEqual(
            fs.GROUPS,
            ("decide", "overdue", "today", "week", "later", "no_date", "blocked", "suggested"),
        )
        self.assertEqual(
            fs.KINDS,
            ("approval", "rule_review", "question", "draft", "task", "todo", "suggestion"),
        )
```

- [ ] **Step 2: Run them to verify they fail**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_shape --parallel auto --noinput`
Expected: FAIL — `ImportError: cannot import name 'feed_shape'`.

- [ ] **Step 3: Write `services/work/feed_shape.py`**

```python
"""The feed's fixed words and shapes (Work in one place, spec §4.1;
contract docs/superpowers/plans/2026-10-12-work-one-place-api.md §2): its
kinds and groups, the page size, the kind filter, the item shape and the
paging cursor. No queries here.

The cursor is a keyset position ("after this row"), not an offset, so rows
acted on between pages never make another row skip or repeat. It is bound to
its group and to that group's sort key shape."""

import base64
import binascii
import json
from datetime import date, datetime

from django.db.models import Q
from rest_framework import serializers

from services.customers.models import Customer

PAGE = 50

APPROVAL = "approval"
RULE_REVIEW = "rule_review"
QUESTION = "question"
DRAFT = "draft"
TASK = "task"
TODO = "todo"
SUGGESTION = "suggestion"
#: Every kind, in the order `failed` lists them.
KINDS = (APPROVAL, RULE_REVIEW, QUESTION, DRAFT, TASK, TODO, SUGGESTION)
#: The decide group's kinds, in the order a tie on `at` is broken.
DECIDE_KINDS = (RULE_REVIEW, APPROVAL, QUESTION, DRAFT)

DECIDE = "decide"
TASK_GROUPS = ("overdue", "today", "week", "later", "no_date", "blocked")
SUGGESTED = "suggested"
GROUPS = (DECIDE, *TASK_GROUPS, SUGGESTED)

CHOOSE_KIND = "Choose approval, rule_review, question, draft, task, todo or suggestion."
CHOOSE_GROUP = "Choose decide, overdue, today, week, later, no_date, blocked or suggested."
CURSOR_NEEDS_GROUP = "Say which group to page."
STALE_CURSOR = "That list has changed. Reload Work."

#: Each group's sort key, as cursor tags: t datetime, d date, i integer.
SHAPES = {
    DECIDE: ("t", "i", "i"),
    SUGGESTED: ("t", "i"),
    **{key: ("d", "i", "t", "i") for key in TASK_GROUPS},
}

_stamp = serializers.DateTimeField().to_representation


class BadQuery(Exception):
    """A query parameter the feed refuses: 400 `{field: [message]}`."""

    def __init__(self, field, message):
        super().__init__(message)
        self.field = field
        self.message = message


def parse_kinds(raw):
    """`?kind=` as a set of kinds; every kind when it is absent."""
    if raw is None:
        return frozenset(KINDS)
    asked = {part.strip() for part in raw.split(",") if part.strip()}
    if not asked or not asked <= set(KINDS):
        raise BadQuery("kind", CHOOSE_KIND)
    return frozenset(asked)


def record_ref(record):
    kind = "customer" if isinstance(record, Customer) else "account"
    return {"type": kind, "id": record.pk, "name": record.name}


def item(
    *,
    key,
    kind,
    pk,
    title,
    record,
    source,
    at,
    actions,
    detail,
    due_date=None,
    priority=None,
    private=False,
):
    """One FeedItem (contract §2.2)."""
    return {
        "key": key,
        "kind": kind,
        "id": pk,
        "title": title,
        "record": record,
        "from": source,
        "at": _stamp(at),
        "due_date": None if due_date is None else due_date.isoformat(),
        "priority": priority,
        "private": private,
        "actions": list(actions),
        "detail": detail,
    }


def group(key, count, rows):
    """A group's payload from `(sort key, item)` rows already in order. More
    than PAGE rows means another page: its cursor is the last shown row's key."""
    shown = rows[:PAGE]
    more = len(rows) > PAGE
    return {
        "key": key,
        "count": count,
        "items": [entry for _key, entry in shown],
        "next": encode(key, shown[-1][0]) if more else None,
    }


def _dump(value):
    if isinstance(value, datetime):
        return ["t", value.isoformat()]
    if isinstance(value, date):
        return ["d", value.isoformat()]
    if isinstance(value, int) and not isinstance(value, bool):
        return ["i", value]
    raise TypeError(type(value).__name__)


def _load(pair, tag):
    found, raw = pair
    if found != tag:
        raise ValueError(found)
    if tag == "t":
        return datetime.fromisoformat(raw)
    if tag == "d":
        return date.fromisoformat(raw)
    if isinstance(raw, int) and not isinstance(raw, bool):
        return raw
    raise ValueError(raw)


def encode(group_key, values):
    text = json.dumps([group_key, [_dump(v) for v in values]], separators=(",", ":"))
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


def decode(group_key, token):
    """The position `encode` wrote for `group_key`; BadQuery when it is not one."""
    try:
        padded = token + "=" * (-len(token) % 4)
        found, values = json.loads(base64.urlsafe_b64decode(padded.encode()))
        tags = SHAPES[group_key]
        if found != group_key or len(values) != len(tags):
            raise ValueError(found)
        return tuple(_load(pair, tag) for pair, tag in zip(values, tags, strict=True))
    except (ValueError, TypeError, KeyError, binascii.Error, UnicodeDecodeError):
        raise BadQuery("cursor", STALE_CURSOR) from None


def after_q(fields, values, *, descending=False):
    """Rows strictly after `values` in the order of `fields` (a keyset)."""
    op = "lt" if descending else "gt"
    found = None
    for i, name in enumerate(fields):
        step = Q(**dict(zip(fields[:i], values[:i], strict=True)), **{f"{name}__{op}": values[i]})
        found = step if found is None else found | step
    return found
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_shape --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/work/feed_shape.py services/work/tests/test_feed_shape.py
git commit -m "feat(work): the feed's kinds, groups, item shape and keyset cursor

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The feed's tasks and to-dos

**Files:**
- Create: `services/work/tests/feed_fixtures.py`
- Create: `services/work/feed_tasks.py`
- Create: `services/work/tests/test_feed_tasks.py`

**Interfaces:**
- Consumes: `feed_shape` (Task 4); `task_access.openable_tasks`, `todo_q`, `is_todo`, `record_of` (Task 2); `task_payloads.task_row`, `ROW_RELATED` (Task 3); `work.states.open_tasks`.
- Produces (in `services.work.feed_tasks`):
  - `group_q(group: str, today: date) -> Q`; `group_of(task, today) -> str`.
  - `source_of(task) -> {"type", "label"}`; `task_item(task) -> FeedItem`.
  - `class Tasks(reader, today, kinds)` with class attribute `KINDS = ("task", "todo")`, `.asked: list[str]` (the asked of `("task", "todo")`), `.counts() -> dict[group, int]` (one query), `.hidden() -> int`, `.tasks(group, after, limit) -> list[Task]` (annotated `due_key`, `prio`), `.page(group, after, limit) -> list[(sort_key, FeedItem)]`. Sort key: `(due_key: date, prio: int, created_at: datetime, id: int)`.
- Produces (in `services.work.tests.feed_fixtures`): `FeedFixture(WaitingFixture)` with `todo(owner, *, title, due_in, priority, status, reason)`, `due(assignee, on, *, due_in, title, priority, status, reason, created_by, source)`, `suggestion(recipient, on, *, kind, title, suggested)`, `reply(owner, record, *, agent)`, `age(row, days)`, `feed(user, **params)`, `body(user, **params)`, `group(body, key)` (static); constants `FEED`, `COUNT`, `TODOS`. Inherited from `WaitingFixture`: `proposal`, `session`, `review`, `question`, `task`; from `BrainFixture`: `org, admin, lee, mona, csm, other, stranger, pizza, dough, soup, taco, loose, emea, east, west, today, as_user`.

- [ ] **Step 1: Write the fixture**

Create `services/work/tests/feed_fixtures.py`:

```python
"""The feed's tests' world: Brain's Waiting fixture (Carl owns Pizza Hut,
Dough Co, Pizza EMEA and Taco East and reports to Mona; Dana owns Taco Bell
and Taco West, which Carl cannot open; Mona owns Soup Co, which Carl cannot
open; Alice is an admin with view-all and Leadership; Lee is Leadership
without it), plus makers for to-dos, dated record tasks, suggestions and
reply drafts."""

import itertools
from datetime import timedelta

from django.utils import timezone

from services.accounts.models import User
from services.agents.tests.drafts_fixtures import draft, ticket
from services.brain.tests.waiting_fixtures import WaitingFixture
from services.customers.models import Customer, Task
from services.work.models import Recommendation

FEED = "/api/v1/work/feed/"
COUNT = "/api/v1/work/feed/count/"
TODOS = "/api/v1/work/todos/"
_numbers = itertools.count(1)


class FeedFixture(WaitingFixture):
    def todo(
        self,
        owner,
        *,
        title="Book the dentist",
        due_in=None,
        priority="medium",
        status="pending",
        reason="",
    ):
        """A to-do of `owner`'s: no record, theirs, dated `due_in` days from today (None: no date)."""
        return Task.objects.create(
            title=title,
            assignee=owner,
            assignee_name=owner.name,
            created_by=owner,
            due_date=None if due_in is None else self.today + timedelta(days=due_in),
            priority=priority,
            status=status,
            blocked_reason=reason,
        )

    def due(
        self,
        assignee,
        on,
        *,
        due_in,
        title="Call the sponsor",
        priority="medium",
        status="pending",
        reason="",
        created_by=None,
        source="manual",
    ):
        """A task on `on` (an organisation or an account) for `assignee`."""
        parent = {"customer": on} if isinstance(on, Customer) else {"account": on}
        return Task.objects.create(
            **parent,
            title=title,
            assignee=assignee,
            assignee_name=assignee.name,
            created_by=created_by or assignee,
            due_date=self.today + timedelta(days=due_in),
            priority=priority,
            status=status,
            blocked_reason=reason,
            source=source,
        )

    def suggestion(self, recipient, on, *, kind="renewal_due", title=None, suggested=None):
        """An open recommendation sent to `recipient` about `on`."""
        if isinstance(on, Customer):
            customer, account = on, None
        else:
            customer, account = on.customers.order_by("id").first(), on
        return Recommendation.objects.create(
            organisation=self.org,
            customer=customer,
            account=account,
            kind=kind,
            title=title or f"Prepare {on.name}'s renewal",
            why={"facts": ["Renews in 30 days"], "evidence": []},
            suggested_assignee=suggested or recipient,
            recipient=recipient,
        )

    def reply(self, owner, record, *, agent="cs"):
        """An open reply draft of `owner`'s answering a fresh ticket on `record`."""
        return draft(ticket(record, number=f"TKT-{next(_numbers)}"), owner, agent=agent)

    def age(self, row, days):
        type(row).objects.filter(pk=row.pk).update(created_at=timezone.now() - timedelta(days=days))

    def feed(self, user, **params):
        return self.as_user(User.objects.get(pk=user.pk)).get(FEED, params)

    def body(self, user, **params):
        response = self.feed(user, **params)
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        return response.json()

    @staticmethod
    def group(body, key):
        return next(g for g in body["groups"] if g["key"] == key)
```

- [ ] **Step 2: Write the failing tests**

Create `services/work/tests/test_feed_tasks.py`:

```python
"""The feed's tasks and to-dos (contract §2.1, §2.2): every open task the
reader may read and every to-do of theirs in exactly one of six groups,
ordered by date, priority and age; the rest counted in `hidden`."""

from datetime import timedelta

from rest_framework import serializers

from services.accounts.models import User
from services.customers.models import Task
from services.work.feed_shape import TASK, TODO
from services.work.feed_tasks import Tasks, group_of, source_of
from services.work.tests.feed_fixtures import FeedFixture

stamp = serializers.DateTimeField().to_representation


class FeedTasksTests(FeedFixture):
    def tasks(self, user, kinds=(TASK, TODO)):
        return Tasks(User.objects.get(pk=user.pk), self.today, frozenset(kinds))

    def ids(self, source, group):
        return [t.pk for t in source.tasks(group, None, 50)]

    def test_every_open_task_and_to_do_lands_in_one_group(self):
        late = self.due(self.csm, self.pizza, due_in=-2)
        now = self.due(self.csm, self.dough, due_in=0)
        soon = self.due(self.csm, self.emea, due_in=7)
        far = self.due(self.csm, self.pizza, due_in=8)
        stuck = self.due(self.csm, self.dough, due_in=-5, status="blocked", reason="Legal")
        loose = self.todo(self.csm)
        late_todo = self.todo(self.csm, title="Renew passport", due_in=-1)
        self.due(self.csm, self.pizza, due_in=-3, status="completed")
        source = self.tasks(self.csm)
        self.assertEqual(
            source.counts(),
            {"overdue": 2, "today": 1, "week": 1, "later": 1, "no_date": 1, "blocked": 1},
        )
        self.assertEqual(self.ids(source, "overdue"), [late.pk, late_todo.pk])
        self.assertEqual(self.ids(source, "today"), [now.pk])
        self.assertEqual(self.ids(source, "week"), [soon.pk])
        self.assertEqual(self.ids(source, "later"), [far.pk])
        self.assertEqual(self.ids(source, "no_date"), [loose.pk])
        self.assertEqual(self.ids(source, "blocked"), [stuck.pk])
        for task in (late, now, soon, far, stuck, loose, late_todo):
            self.assertIn(task.pk, self.ids(source, group_of(task, self.today)))

    def test_a_group_reads_by_date_then_priority_then_age(self):
        low = self.due(self.csm, self.pizza, due_in=-1, priority="low")
        high = self.due(self.csm, self.pizza, due_in=-1, priority="high")
        first_medium = self.due(self.csm, self.pizza, due_in=-1, priority="medium")
        second_medium = self.due(self.csm, self.pizza, due_in=-1, priority="medium")
        earlier = self.due(self.csm, self.pizza, due_in=-4, priority="low")
        self.assertEqual(
            self.ids(self.tasks(self.csm), "overdue"),
            [earlier.pk, high.pk, first_medium.pk, second_medium.pk, low.pk],
        )

    def test_blocked_puts_no_date_last(self):
        undated = self.todo(self.csm, status="blocked", reason="Waiting on HR", priority="high")
        dated = self.due(
            self.csm, self.pizza, due_in=10, status="blocked", reason="Legal", priority="low"
        )
        self.assertEqual(self.ids(self.tasks(self.csm), "blocked"), [dated.pk, undated.pk])

    def test_paging_after_a_position_never_skips_or_repeats(self):
        made = [self.todo(self.csm, title=f"To-do {i}") for i in range(5)]
        first = self.tasks(self.csm).page("no_date", None, 2)
        self.assertEqual([entry["id"] for _key, entry in first], [made[0].pk, made[1].pk])
        Task.objects.filter(pk=made[0].pk).update(status="completed")
        rest = self.tasks(self.csm).page("no_date", first[-1][0], 10)
        self.assertEqual([entry["id"] for _key, entry in rest], [m.pk for m in made[2:]])

    def test_only_the_creator_has_their_to_dos(self):
        self.todo(self.csm, due_in=-1)
        for reader in (self.mona, self.admin, self.lee, self.other):
            self.assertEqual(sum(self.tasks(reader).counts().values()), 0, reader.name)

    def test_hidden_counts_the_readers_tasks_on_records_they_cannot_open(self):
        self.due(self.csm, self.west, due_in=-1, created_by=self.other)
        source = self.tasks(self.csm)
        self.assertEqual((source.hidden(), sum(source.counts().values())), (1, 0))
        self.assertEqual(self.tasks(self.csm, kinds=(TODO,)).hidden(), 0)

    def test_the_kind_filter(self):
        task = self.due(self.csm, self.pizza, due_in=-1)
        todo = self.todo(self.csm, due_in=-1)
        self.assertEqual(self.ids(self.tasks(self.csm, kinds=(TASK,)), "overdue"), [task.pk])
        self.assertEqual(self.ids(self.tasks(self.csm, kinds=(TODO,)), "overdue"), [todo.pk])
        self.assertEqual(self.tasks(self.csm, kinds=(TODO,)).asked, [TODO])

    def test_a_to_do_item(self):
        todo = self.todo(self.csm, priority="high")
        ((key, entry),) = self.tasks(self.csm).page("no_date", None, 5)
        self.assertEqual(key[2:], (todo.created_at, todo.pk))
        detail = entry.pop("detail")
        self.assertEqual(
            entry,
            {
                "key": f"task:{todo.pk}",
                "kind": "todo",
                "id": todo.pk,
                "title": "Book the dentist",
                "record": None,
                "from": {"type": "person", "label": "Carl CSM"},
                "at": stamp(todo.created_at),
                "due_date": None,
                "priority": "high",
                "private": True,
                "actions": ["done", "open"],
            },
        )
        self.assertEqual((detail["id"], detail["parent"], detail["private"]), (todo.pk, None, True))

    def test_a_task_item_names_its_record(self):
        task = self.due(self.csm, self.emea, due_in=0, created_by=self.mona)
        ((_key, entry),) = self.tasks(self.csm).page("today", None, 5)
        self.assertEqual(entry["kind"], "task")
        self.assertEqual(
            entry["record"], {"type": "account", "id": self.emea.pk, "name": "Pizza EMEA"}
        )
        self.assertEqual(entry["from"], {"type": "person", "label": "Mona Manager"})
        self.assertEqual(entry["due_date"], self.today.isoformat())
        self.assertFalse(entry["private"])
        self.assertEqual(entry["key"], f"task:{task.pk}")

    def test_where_a_task_came_from(self):
        cases = {
            "agent": {"type": "agent", "label": "AI agent"},
            "rule": {"type": "rule", "label": "A rule"},
            "recommendation": {"type": "revenact", "label": "Revenact"},
        }
        for source, expected in cases.items():
            task = self.due(self.csm, self.pizza, due_in=1, source=source)
            self.assertEqual(source_of(task), expected)
        seeded = self.due(self.csm, self.pizza, due_in=1)
        seeded.created_by = None
        self.assertEqual(source_of(seeded), {"type": "revenact", "label": "Revenact"})

    def test_group_of_a_dateless_and_a_week_away_task(self):
        self.assertEqual(group_of(self.todo(self.csm), self.today), "no_date")
        week = self.due(self.csm, self.pizza, due_in=1)
        self.assertEqual(group_of(week, self.today), "week")
        self.assertEqual(group_of(week, self.today + timedelta(days=1)), "today")
```

- [ ] **Step 3: Run them to verify they fail**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_tasks --parallel auto --noinput`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.work.feed_tasks'`.

- [ ] **Step 4: Write `services/work/feed_tasks.py`**

```python
"""The feed's tasks and to-dos (Work in one place, spec §4.1): open tasks
with a record assigned to the reader that they may read (`task`, as
`/work/today`), and the reader's own to-dos (`todo`), in six groups by due
date. One source, so the two interleave in date order and fail together.

A Blocked task is only in `blocked`, whatever its date (`work.states`).
Tasks on records the reader can no longer open are counted in `hidden`."""

from datetime import date, timedelta

from django.db.models import Case, Count, DateField, IntegerField, Q, Value, When
from django.db.models.functions import Coalesce

from services.customers.models import Task
from services.customers.task_access import is_todo, openable_tasks, record_of, todo_q
from services.customers.task_payloads import ROW_RELATED, task_row

from .feed_shape import TASK, TASK_GROUPS, TODO, after_q, item, record_ref
from .states import open_tasks

WEEK = timedelta(days=7)
#: Where a task with no date sorts: after every dated one.
NO_DATE = date.max
ORDER = ("due_key", "prio", "created_at", "id")
PRIORITY_RANK = Case(
    When(priority=Task.Priority.HIGH, then=Value(0)),
    When(priority=Task.Priority.MEDIUM, then=Value(1)),
    default=Value(2),
    output_field=IntegerField(),
)
FROM_SOURCE = {
    Task.Source.AGENT: {"type": "agent", "label": "AI agent"},
    Task.Source.RULE: {"type": "rule", "label": "A rule"},
    Task.Source.RECOMMENDATION: {"type": "revenact", "label": "Revenact"},
}
REVENACT = {"type": "revenact", "label": "Revenact"}


def group_q(group, today):
    blocked = Q(status=Task.Status.BLOCKED)
    if group == "blocked":
        return blocked
    dated = {
        "overdue": Q(due_date__lt=today),
        "today": Q(due_date=today),
        "week": Q(due_date__gt=today, due_date__lte=today + WEEK),
        "later": Q(due_date__gt=today + WEEK),
        "no_date": Q(due_date__isnull=True),
    }
    return ~blocked & dated[group]


def group_of(task, today):
    """`group_q` for one task in hand."""
    if task.status == Task.Status.BLOCKED:
        return "blocked"
    if task.due_date is None:
        return "no_date"
    if task.due_date < today:
        return "overdue"
    if task.due_date == today:
        return "today"
    if task.due_date <= today + WEEK:
        return "week"
    return "later"


def source_of(task):
    if task.source in FROM_SOURCE:
        return FROM_SOURCE[task.source]
    if task.created_by_id is None:
        return REVENACT
    return {"type": "person", "label": task.created_by.name}


def task_item(task):
    """The FeedItem for a task the reader reads (Every task on the desk is
    assigned to the reader, who may always move its status: contract
    Decision 12)."""
    todo = is_todo(task)
    return item(
        key=f"task:{task.pk}",
        kind=TODO if todo else TASK,
        pk=task.pk,
        title=task.title,
        record=None if todo else record_ref(record_of(task)),
        source=source_of(task),
        at=task.created_at,
        due_date=task.due_date,
        priority=task.priority,
        private=todo,
        actions=["done", "open"],
        detail=task_row(task),
    )


class Tasks:
    KINDS = (TASK, TODO)

    def __init__(self, reader, today, kinds):
        self.reader, self.today = reader, today
        self.asked = [kind for kind in self.KINDS if kind in kinds]
        self.assigned = (
            open_tasks()
            .filter(assignee_id=reader.pk)
            .filter(Q(customer__isnull=False) | Q(account__isnull=False))
        )
        parts = []
        if TASK in kinds:
            # SOC2:AUTH-02 the twice-filter: the task's own rule, on a record the reader may open
            parts.append(Q(id__in=openable_tasks(reader, self.assigned).values("id")))
        if TODO in kinds:
            # SOC2:AUTH-02 a to-do is its creator's alone
            parts.append(todo_q(reader))
        wanted = parts[0]
        for part in parts[1:]:
            wanted |= part
        self.rows = open_tasks().filter(wanted)

    def counts(self):
        """Every group's full total, in one query."""
        return self.rows.aggregate(
            **{key: Count("id", filter=group_q(key, self.today)) for key in TASK_GROUPS}
        )

    def hidden(self):
        """Open tasks assigned to the reader on records they can no longer open."""
        if TASK not in self.asked:
            return 0
        return self.assigned.count() - openable_tasks(self.reader, self.assigned).count()

    def tasks(self, group, after, limit):
        rows = (
            self.rows.filter(group_q(group, self.today))
            .annotate(
                due_key=Coalesce("due_date", Value(NO_DATE), output_field=DateField()),
                prio=PRIORITY_RANK,
            )
            .select_related(*ROW_RELATED, "created_by")
        )
        if after is not None:
            rows = rows.filter(after_q(ORDER, after))
        return list(rows.order_by(*ORDER)[:limit])

    def page(self, group, after, limit):
        return [
            ((task.due_key, task.prio, task.created_at, task.pk), task_item(task))
            for task in self.tasks(group, after, limit)
        ]
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_tasks --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/work/feed_tasks.py services/work/tests/feed_fixtures.py services/work/tests/test_feed_tasks.py
git commit -m "feat(work): the feed's tasks and to-dos in six date groups

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `POST /work/todos/`

**Files:**
- Create: `services/work/todos.py`
- Modify: `services/work/views.py`, `services/work/urls.py`
- Create: `services/work/tests/test_todos_api.py`

**Interfaces:**
- Consumes: `task_access.record_for`, `assignee_for`, `TODO_ONLY_YOURS` (Task 3); `task_changes.add_task(parent=None)` (Task 3); `feed_tasks.task_item`, `group_of` (Task 5); `task_payloads.task_detail`, `DETAIL_RELATED`.
- Produces: `services.work.todos.TodoSerializer`, `create(reader, data) -> Task`, `created_payload(reader, task, *, today) -> dict`; route `work-todos` at `/api/v1/work/todos/`.

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_todos_api.py`:

```python
"""POST /work/todos/ (contract §1.1): a private to-do, or a task on a record
under the record task routes' rules."""

from datetime import timedelta

from services.accounts.models import User
from services.customers.models import Task, TaskEvent
from services.notifications.models import Notification
from services.work.tests.feed_fixtures import TODOS, FeedFixture

OPENABLE = "Choose an organisation or account you can open."


class TodoCreateTests(FeedFixture):
    def post(self, body, user=None):
        client = self.as_user(User.objects.get(pk=(user or self.csm).pk))
        return client.post(TODOS, body, format="json")

    def test_a_title_makes_a_private_to_do_with_no_date(self):
        response = self.post({"title": "  Book the QBR room "})
        self.assertEqual(response.status_code, 201, response.json())
        body = response.json()
        task = Task.objects.get(pk=body["task"]["id"])
        self.assertEqual(
            (task.title, task.customer_id, task.account_id, task.due_date, task.priority),
            ("Book the QBR room", None, None, None, "medium"),
        )
        self.assertEqual(
            (task.created_by_id, task.assignee_id, task.source),
            (self.csm.pk, self.csm.pk, "manual"),
        )
        self.assertEqual(body["group"], "no_date")
        self.assertEqual(
            {k: body["item"][k] for k in ("key", "kind", "private", "record", "actions")},
            {
                "key": f"task:{task.pk}",
                "kind": "todo",
                "private": True,
                "record": None,
                "actions": ["done", "open"],
            },
        )
        self.assertTrue(body["task"]["private"])
        self.assertTrue(TaskEvent.objects.filter(task=task, kind="created").exists())
        self.assertFalse(Notification.objects.exists())

    def test_a_dated_prioritised_to_do(self):
        day = (self.today - timedelta(days=1)).isoformat()
        body = self.post({"title": "Renew passport", "due_date": day, "priority": "high"}).json()
        self.assertEqual(
            (body["group"], body["item"]["due_date"], body["item"]["priority"]),
            ("overdue", day, "high"),
        )

    def test_a_to_do_is_only_ever_yours(self):
        response = self.post({"title": "x", "assignee_id": self.mona.pk})
        self.assertEqual(
            (response.status_code, response.json()),
            (400, {"assignee": ["A to-do without a record can only be yours."]}),
        )
        self.assertEqual(self.post({"title": "x", "assignee_id": self.csm.pk}).status_code, 201)

    def test_with_a_record_it_is_an_ordinary_task(self):
        response = self.post(
            {"title": "Prep QBR", "customer_id": self.pizza.pk, "due_date": self.today.isoformat()}
        )
        self.assertEqual(response.status_code, 201, response.json())
        body = response.json()
        self.assertEqual((body["group"], body["item"]["kind"]), ("today", "task"))
        self.assertEqual(
            body["item"]["record"], {"type": "customer", "id": self.pizza.pk, "name": "Pizza Hut"}
        )
        self.assertEqual(Task.objects.get(pk=body["task"]["id"]).customer_id, self.pizza.pk)

    def test_given_to_someone_else_it_is_not_on_your_desk(self):
        response = self.post(
            {
                "title": "Call Pizza",
                "customer_id": self.pizza.pk,
                "due_date": self.today.isoformat(),
                "assignee_id": self.csm.pk,
            },
            user=self.mona,
        )
        body = response.json()
        self.assertEqual(response.status_code, 201, body)
        self.assertEqual((body["item"], body["group"]), (None, None))

    def test_a_record_task_tells_its_assignee(self):
        response = self.post(
            {
                "title": "Call Pizza",
                "customer_id": self.pizza.pk,
                "due_date": self.today.isoformat(),
                "assignee_id": self.csm.pk,
            },
            user=self.mona,
        )
        self.assertEqual(response.status_code, 201, response.json())
        self.assertTrue(
            Notification.objects.filter(recipient=self.csm, kind="task_assigned").exists()
        )

    def test_refusals(self):
        today = self.today.isoformat()
        cases = (
            ({}, {"title": ["Give the task a title."]}),
            ({"title": "   "}, {"title": ["Give the task a title."]}),
            ({"title": "x" * 256}, {"title": ["Keep the title under 255 characters."]}),
            ({"title": "x", "due_date": "soon"}, {"due_date": ["Choose a date."]}),
            ({"title": "x", "priority": "urgent"}, {"priority": ["Choose high, medium or low."]}),
            ({"title": "x", "customer_id": "pizza"}, {"customer_id": [OPENABLE]}),
            ({"title": "x", "assignee_id": "carl"}, {"assignee_id": ["Choose who does it."]}),
            (
                {
                    "title": "x",
                    "customer_id": self.pizza.pk,
                    "account_id": self.emea.pk,
                    "due_date": today,
                },
                {"record": ["Choose an organisation or an account, not both."]},
            ),
            (
                {"title": "x", "customer_id": self.soup.pk, "due_date": today},
                {"record": [OPENABLE]},
            ),
            (
                {"title": "x", "customer_id": self.globex.pk, "due_date": today},
                {"record": [OPENABLE]},
            ),
            ({"title": "x", "customer_id": 999_999, "due_date": today}, {"record": [OPENABLE]}),
            ({"title": "x", "customer_id": self.pizza.pk}, {"due_date": ["Choose a date."]}),
            (
                {"title": "x", "customer_id": self.pizza.pk, "due_date": None},
                {"due_date": ["Choose a date."]},
            ),
        )
        for body, error in cases:
            response = self.post(body)
            self.assertEqual((response.status_code, response.json()), (400, error), body)
        self.assertFalse(Task.objects.exists())

    def test_an_assignee_who_cannot_open_the_record(self):
        response = self.post(
            {
                "title": "x",
                "customer_id": self.pizza.pk,
                "due_date": self.today.isoformat(),
                "assignee_id": self.other.pk,
            }
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(),
            {"code": "ASSIGNEE_CANNOT_OPEN", "detail": "That person can't open this organisation."},
        )

    def test_signed_out_is_refused(self):
        from rest_framework.test import APIClient

        self.assertEqual(APIClient().post(TODOS, {"title": "x"}, format="json").status_code, 401)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `venv/bin/python manage.py test services.work.tests.test_todos_api --parallel auto --noinput`
Expected: FAIL — 404 on `/api/v1/work/todos/`.

- [ ] **Step 3: Write `services/work/todos.py`**

```python
"""Making a to-do, or a task on a record, from Work's quick-add (Work in one
place, spec §3; contract §1.1). Without a record it is a to-do: the
caller's alone. With one it is the task the record's own Tasks route would
make, under that route's rules (a date, an assignee who can open it)."""

from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from services.customers.models import Task
from services.customers.task_access import (
    RECORD_YOU_CAN_OPEN,
    TODO_ONLY_YOURS,
    assignee_for,
    record_for,
)
from services.customers.task_changes import add_task
from services.customers.task_payloads import DETAIL_RELATED, task_detail
from services.customers.task_views import (
    CHOOSE_ASSIGNEE,
    CHOOSE_DATE,
    CHOOSE_PRIORITY,
    LONG_TITLE,
    NO_TITLE,
)

from .feed_tasks import group_of, task_item

_record_id = {
    "required": False,
    "allow_null": True,
    "error_messages": {"invalid": RECORD_YOU_CAN_OPEN, "max_string_length": RECORD_YOU_CAN_OPEN},
}


class TodoSerializer(serializers.Serializer):
    title = serializers.CharField(
        max_length=255,
        error_messages={
            "required": NO_TITLE,
            "blank": NO_TITLE,
            "null": NO_TITLE,
            "invalid": NO_TITLE,
            "max_length": LONG_TITLE,
        },
    )
    due_date = serializers.DateField(
        required=False,
        allow_null=True,
        error_messages={"invalid": CHOOSE_DATE, "datetime": CHOOSE_DATE},
    )
    priority = serializers.ChoiceField(
        required=False,
        choices=Task.Priority.choices,
        error_messages={"invalid_choice": CHOOSE_PRIORITY, "null": CHOOSE_PRIORITY},
    )
    customer_id = serializers.IntegerField(**_record_id)
    account_id = serializers.IntegerField(**_record_id)
    assignee_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        error_messages={"invalid": CHOOSE_ASSIGNEE, "max_string_length": CHOOSE_ASSIGNEE},
    )


def create(reader, data):
    """The task `data` (TodoSerializer's) asks for, made by `reader`."""
    record = record_for(reader, data.get("customer_id"), data.get("account_id"))
    pk = data.get("assignee_id")
    if record is None:
        if pk is not None and pk != reader.pk:
            # SOC2:AUTH-02 a to-do is its creator's alone
            raise ValidationError({"assignee": [TODO_ONLY_YOURS]})
        assignee = reader
    else:
        if data.get("due_date") is None:
            raise ValidationError({"due_date": [CHOOSE_DATE]})
        # SOC2:AUTH-02 a task is given only to an active member who can open its record
        assignee = reader if pk is None else assignee_for(reader.organisation_id, pk, record)
    return add_task(
        parent=record,
        title=data["title"],
        due_date=data.get("due_date"),
        priority=data.get("priority") or Task.Priority.MEDIUM,
        assignee=assignee,
        created_by=reader,
        actor=reader,
        source=Task.Source.MANUAL,
    )


def created_payload(reader, task, *, today):
    """`{task, item, group}`: the panel's task, and the feed row and its
    group when the task is on the reader's own desk (else both None)."""
    task = Task.objects.select_related(*DETAIL_RELATED).get(pk=task.pk)
    mine = task.assignee_id == reader.pk
    return {
        "task": task_detail(task, reader),
        "item": task_item(task) if mine else None,
        "group": group_of(task, today) if mine else None,
    }
```

- [ ] **Step 4: The view and the route**

In `services/work/views.py`, add `todos` to `from . import assignees, deciding, drill, prefs, recommendations, team, today` (keep alphabetical: `..., team, today, todos`), and add after `TodayView`:

```python
class TodoCreateView(APIView):
    """POST /api/v1/work/todos/ — a private to-do, or a task on a record."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        body = todos.TodoSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        task = todos.create(request.user, body.validated_data)
        on = today_for(request.user.organisation)
        return Response(
            todos.created_payload(request.user, task, today=on), status=status.HTTP_201_CREATED
        )
```

In `services/work/urls.py`, add after the `today/` path:

```python
(path("todos/", views.TodoCreateView.as_view(), name="work-todos"),)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.work.tests.test_todos_api --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/work/todos.py services/work/views.py services/work/urls.py services/work/tests/test_todos_api.py
git commit -m "feat(work): POST /work/todos/ makes a private to-do or a record task

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The decide group's four sources

**Files:**
- Create: `services/work/feed_decide.py`
- Create: `services/work/tests/test_feed_decide.py`

**Interfaces:**
- Consumes: `brain.desk.rule_reviews`, `agent_actions`, `questions`, `session_ids_seen_whole`; `brain.scope.resolve`, `ME`; `agents.deciding.may_decide`; `agents.bulk.using`; `agents.payloads.action_payload`; `rules.payloads.review_payload`, `review_campaign_names`; `copilot.views.NEUTRAL_TITLE`; `feed_shape` (Task 4).
- Produces (in `services.work.feed_decide`): classes `RuleReviews`, `Approvals`, `Questions`, `Drafts`, each constructed as `Cls(reader)`, with `.kind`, `.rank` (0, 1, 2, 3), `.count() -> int`, `.hidden() -> int`, `.page(after: tuple | None, limit: int) -> list[((created_at, rank, id), FeedItem)]`; `MAKERS: dict[kind, class]`; `draft_title(draft) -> str`.

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_feed_decide.py`:

```python
"""The decide group's sources (contract §2.2): agent actions, rule
reviews and questions on the reader's Me desk (Brain's rules, unchanged) and
the reader's own open reply drafts; each listed only on records the reader
may open, the rest counted."""

from services.accounts.models import User
from services.work.feed_decide import MAKERS, Approvals, draft_title
from services.work.feed_shape import APPROVAL, DRAFT, QUESTION, RULE_REVIEW
from services.work.tests.feed_fixtures import FeedFixture


class DecideSourceTests(FeedFixture):
    def source(self, kind, user):
        return MAKERS[kind](User.objects.get(pk=user.pk))

    def only(self, kind, user):
        rows = self.source(kind, user).page(None, 10)
        self.assertEqual(len(rows), 1, rows)
        return rows[0]

    def test_an_approval(self):
        action = self.proposal(self.pizza)
        key, entry = self.only(APPROVAL, self.csm)
        self.assertEqual(key, (action.created_at, 1, action.pk))
        self.assertEqual(
            {
                k: entry[k]
                for k in (
                    "key",
                    "kind",
                    "id",
                    "title",
                    "record",
                    "from",
                    "actions",
                    "due_date",
                    "private",
                )
            },
            {
                "key": f"agent_action:{action.pk}",
                "kind": "approval",
                "id": action.pk,
                "title": "Save play",
                "record": {"type": "customer", "id": self.pizza.pk, "name": "Pizza Hut"},
                "from": {"type": "agent", "label": "Ops agent"},
                "actions": ["approve", "reject"],
                "due_date": None,
                "private": False,
            },
        )
        self.assertEqual((entry["detail"]["id"], entry["detail"]["session"]), (action.pk, None))
        source = self.source(APPROVAL, self.csm)
        self.assertEqual((source.count(), source.hidden()), (1, 0))

    def test_an_approval_the_reader_sees_but_may_not_decide_is_read_only(self):
        session = self.session(self.other, self.csm)
        self.proposal(self.taco, session=session)
        _key, entry = self.only(APPROVAL, self.csm)
        self.assertEqual(entry["actions"], [])
        self.assertEqual(entry["detail"]["session"]["title"], "What do we do about Pizza Hut?")

    def test_a_rule_review(self):
        review = self.review(self.csm)
        key, entry = self.only(RULE_REVIEW, self.csm)
        self.assertEqual(key, (review.created_at, 0, review.pk))
        self.assertEqual(
            (entry["key"], entry["title"], entry["record"], entry["from"], entry["actions"]),
            (
                f"rule_review:{review.pk}",
                "Survey from Detractor follow-up",
                None,
                {"type": "rule", "label": "Detractor follow-up"},
                ["approve", "skip"],
            ),
        )
        self.assertEqual(entry["detail"]["review"]["id"], review.pk)
        self.assertEqual(entry["detail"]["counts"], {"people": 12, "records": 3})
        self.assertEqual(self.source(RULE_REVIEW, self.mona).count(), 0)

    def test_a_question(self):
        question = self.question(self.csm, customer=self.pizza, text="Who signs off renewals?")
        key, entry = self.only(QUESTION, self.csm)
        self.assertEqual(key, (question.created_at, 2, question.pk))
        self.assertEqual(
            (entry["title"], entry["record"]["id"], entry["from"], entry["actions"]),
            (
                "Who signs off renewals?",
                self.pizza.pk,
                {"type": "person", "label": "Alice Admin"},
                ["answer"],
            ),
        )
        self.assertEqual(
            entry["detail"],
            {
                "text": "Who signs off renewals?",
                "asked_by": {"id": self.admin.pk, "name": "Alice Admin"},
            },
        )

    def test_a_question_on_a_record_the_reader_cannot_open_is_hidden(self):
        self.question(self.csm, customer=self.soup)
        source = self.source(QUESTION, self.csm)
        self.assertEqual((source.count(), source.hidden(), source.page(None, 10)), (0, 1, []))

    def test_a_draft(self):
        draft = self.reply(self.csm, self.pizza)
        key, entry = self.only(DRAFT, self.csm)
        self.assertEqual(key, (draft.created_at, 3, draft.pk))
        self.assertEqual(
            (entry["key"], entry["title"], entry["from"], entry["actions"], entry["detail"]),
            (
                f"draft:{draft.pk}",
                f"Reply on {draft.ticket.ticket_number}",
                {"type": "agent", "label": "CS agent"},
                ["open"],
                {"channel": "ticket"},
            ),
        )

    def test_only_the_readers_own_drafts_on_records_they_open(self):
        self.reply(self.mona, self.soup)
        self.reply(self.csm, self.soup)
        source = self.source(DRAFT, self.csm)
        self.assertEqual((source.count(), source.hidden()), (0, 1))
        self.assertEqual(self.source(DRAFT, self.mona).count(), 1)

    def test_a_sent_draft_is_done(self):
        draft = self.reply(self.csm, self.pizza)
        type(draft).objects.filter(pk=draft.pk).update(status="sent")
        self.assertEqual(self.source(DRAFT, self.csm).count(), 0)

    def test_an_email_drafts_title_is_its_subject(self):
        draft = self.reply(self.csm, self.pizza)
        draft.channel, draft.subject = "email", "Re: Renewal"
        self.assertEqual(draft_title(draft), "Re: Renewal")
        draft.subject = ""
        self.assertEqual(draft_title(draft), "Reply to an email")

    def test_paging_breaks_a_tie_on_time_by_kind_rank(self):
        review = self.review(self.csm)
        question = self.question(self.csm, customer=self.pizza)
        type(question).objects.filter(pk=question.pk).update(created_at=review.created_at)
        reviews = self.source(RULE_REVIEW, self.csm)
        questions = self.source(QUESTION, self.csm)
        at = review.created_at
        # After the review: the question (rank 2) at the same moment is still to come.
        self.assertEqual(len(questions.page((at, 0, review.pk), 10)), 1)
        # After the question: the review (rank 0) at the same moment is already shown.
        self.assertEqual(reviews.page((at, 2, question.pk), 10), [])

    def test_ranks(self):
        self.assertEqual(
            [MAKERS[k].rank for k in (RULE_REVIEW, APPROVAL, QUESTION, DRAFT)], [0, 1, 2, 3]
        )
        self.assertIs(MAKERS[APPROVAL], Approvals)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_decide --parallel auto --noinput`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.work.feed_decide'`.

- [ ] **Step 3: Write `services/work/feed_decide.py`**

```python
"""The feed's decide group (Work in one place, spec §4.1): agent actions
to approve, rule reviews, questions and the reader's own reply drafts,
oldest first. The first three are Brain's desk sources (`brain.desk`) on
the reader's Me desk, reused unchanged, so nobody sees more than Brain
showed them; drafts are Communications › Drafts' list, on records the
reader may still open. `waiting - readable` is each source's `hidden`.

Each source is `Cls(reader)` with `count`, `hidden` and `page(after,
limit)`; a page's sort key is `(created_at, rank, id)`, so the four merge
into one order and one keyset cursor."""

from django.db.models import Q

from services.agents.deciding import may_decide
from services.brain import desk
from services.brain.scope import ME, resolve
from services.customers.models import ReplyDraft
from services.customers.scoping import visible_accounts, visible_customers
from services.metrics.models import AgentAction

from .feed_shape import APPROVAL, DRAFT, QUESTION, RULE_REVIEW, after_q, item, record_ref

QUESTION_TITLE = 200
AGENTS = dict(AgentAction.Agent.choices)


def person(user):
    return {"id": user.pk, "name": user.name}


def draft_title(draft):
    if draft.channel == ReplyDraft.Channel.TICKET:
        return f"Reply on {draft.ticket.ticket_number}"
    return draft.subject or "Reply to an email"


class Source:
    kind = ""
    rank = 0
    related = ()

    def count(self):
        return self.readable.count()

    def hidden(self):
        return self.waiting.count() - self.count()

    def _after(self, rows, position):
        if position is None:
            return rows
        at, rank, pk = position
        if self.rank > rank:
            return rows.filter(created_at__gte=at)
        if self.rank < rank:
            return rows.filter(created_at__gt=at)
        return rows.filter(after_q(("created_at", "id"), (at, pk)))

    def page(self, after, limit):
        rows = self._after(self.readable, after).select_related(*self.related)
        objects = list(rows.order_by("created_at", "id")[:limit])
        return [
            ((row.created_at, self.rank, row.pk), entry)
            for row, entry in zip(objects, self.items(objects), strict=True)
        ]

    def items(self, objects):
        raise NotImplementedError


class RuleReviews(Source):
    kind, rank = RULE_REVIEW, 0
    related = ("rule__owner", "rule__segment", "rule__organisation", "run")

    def __init__(self, reader):
        self.reader = reader
        found = desk.rule_reviews(reader, resolve(reader, ME))
        self.waiting, self.readable = found.waiting, found.readable

    def items(self, reviews):
        from services.rules.payloads import review_campaign_names, review_payload

        names = review_campaign_names([r for r in reviews if r.rule.owner_id == self.reader.pk])
        out = []
        for review in reviews:
            # SOC2:AUTH-02 only the rule's owner decides its review, and only they read the review
            mine = review.rule.owner_id == self.reader.pk
            out.append(
                item(
                    key=f"rule_review:{review.pk}",
                    kind=RULE_REVIEW,
                    pk=review.pk,
                    title=f"{review.get_kind_display()} from {review.rule.name}",
                    record=None,
                    source={"type": "rule", "label": review.rule.name},
                    at=review.created_at,
                    actions=["approve", "skip"] if mine else [],
                    detail={
                        "rule_id": review.rule_id,
                        "rule_name": review.rule.name,
                        "review_kind": review.kind,
                        "counts": review.counts,
                        "review": review_payload(review, names) if mine else None,
                    },
                )
            )
        return out


class Approvals(Source):
    kind, rank = APPROVAL, 1
    related = ("customer__owner", "account__owner", "session__conversation", "decided_by")

    def __init__(self, reader):
        self.reader = reader
        self.sessions = desk.session_ids_seen_whole(reader)
        found = desk.agent_actions(reader, resolve(reader, ME), self.sessions)
        self.waiting, self.readable = found.waiting, found.readable

    def items(self, actions):
        from services.agents import bulk
        from services.agents.payloads import action_payload
        from services.copilot.views import NEUTRAL_TITLE

        # The previews' reads are done once for the page, not once per row.
        with bulk.using(actions):
            payloads = {a.pk: action_payload(a, self.reader) for a in actions}
            deciders = {a.pk: may_decide(self.reader, a) for a in actions}
        out = []
        for action in actions:
            session = None
            if action.session_id:
                # SOC2:AUTH-02 a conversation's title is for those who see it whole
                title = (
                    action.session.conversation.title
                    if action.session_id in self.sessions
                    else NEUTRAL_TITLE
                )
                session = {"id": action.session_id, "title": title}
            record = action.record
            out.append(
                item(
                    key=f"agent_action:{action.pk}",
                    kind=APPROVAL,
                    pk=action.pk,
                    title=action.title,
                    record=None if record is None else record_ref(record),
                    source={"type": "agent", "label": action.get_agent_display()},
                    at=action.created_at,
                    # SOC2:AUTH-02 offered exactly when the decision routes allow it
                    actions=["approve", "reject"] if deciders[action.pk] else [],
                    detail={**payloads[action.pk], "session": session},
                )
            )
        return out


class Questions(Source):
    kind, rank = QUESTION, 2
    related = ("assignee", "asked_by", "customer")

    def __init__(self, reader):
        self.reader = reader
        found = desk.questions(reader, resolve(reader, ME))
        self.waiting, self.readable = found.waiting, found.readable

    def items(self, questions):
        # SOC2:AUTH-02 QuestionAnswerView's rule: the person asked, or manage_users
        answers_any = self.reader.has_capability("manage_users")
        return [
            item(
                key=f"question:{q.pk}",
                kind=QUESTION,
                pk=q.pk,
                title=q.text[:QUESTION_TITLE],
                record=record_ref(q.customer) if q.customer_id else None,
                source={"type": "person", "label": q.asked_by.name},
                at=q.created_at,
                actions=["answer"] if q.assignee_id == self.reader.pk or answers_any else [],
                detail={"text": q.text, "asked_by": person(q.asked_by)},
            )
            for q in questions
        ]


class Drafts(Source):
    kind, rank = DRAFT, 3
    related = ("customer", "account", "ticket")

    def __init__(self, reader):
        self.reader = reader
        # The reader's own open drafts: Communications › Drafts' list.
        self.waiting = ReplyDraft.objects.filter(
            organisation_id=reader.organisation_id,
            owner_id=reader.pk,
            status=ReplyDraft.Status.OPEN,
        )
        # SOC2:AUTH-02 named only on a record the reader may still open; the rest counted
        self.readable = self.waiting.filter(
            Q(customer_id__in=visible_customers(reader).values("id"))
            | Q(account_id__in=visible_accounts(reader).values("id"))
        )

    def items(self, drafts):
        return [
            item(
                key=f"draft:{d.pk}",
                kind=DRAFT,
                pk=d.pk,
                title=draft_title(d),
                record=record_ref(d.record),
                source={"type": "agent", "label": AGENTS.get(d.agent, "AI agent")},
                at=d.created_at,
                actions=["open"],
                detail={"channel": d.channel},
            )
            for d in drafts
        ]


MAKERS = {RULE_REVIEW: RuleReviews, APPROVAL: Approvals, QUESTION: Questions, DRAFT: Drafts}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_decide --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/work/feed_decide.py services/work/tests/test_feed_decide.py
git commit -m "feat(work): the feed's decide sources over Brain's desk and the reader's drafts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The suggested group

**Files:**
- Create: `services/work/feed_suggest.py`
- Create: `services/work/tests/test_feed_suggest.py`

**Interfaces:**
- Consumes: `rec_access.decidable`, `openable`, `ME`; `recommendations.Opens`, `row_payload`, `LIST_RELATED`; `clock.working_days_for`; `feed_shape`.
- Produces: `services.work.feed_suggest.Suggestions(reader, today)` with `.count()`, `.hidden()`, `.page(after, limit) -> list[((created_at, id), FeedItem)]` newest first; `KINDS` (the four recommendation kinds).

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_feed_suggest.py`:

```python
"""The suggested group (contract §2.2): open recommendations sent to the
reader, of the four kinds shown nowhere else in the feed, on records they
may open; newest first."""

from services.accounts.models import User
from services.work.feed_suggest import Suggestions
from services.work.tests.feed_fixtures import FeedFixture


class SuggestionsTests(FeedFixture):
    def source(self, user):
        return Suggestions(User.objects.get(pk=user.pk), self.today)

    def test_a_suggestion(self):
        rec = self.suggestion(self.csm, self.dough)
        ((key, entry),) = self.source(self.csm).page(None, 10)
        self.assertEqual(key, (rec.created_at, rec.pk))
        self.assertEqual(
            {
                k: entry[k]
                for k in ("key", "kind", "id", "title", "record", "from", "actions", "priority")
            },
            {
                "key": f"recommendation:{rec.pk}",
                "kind": "suggestion",
                "id": rec.pk,
                "title": "Prepare Dough Co's renewal",
                "record": {"type": "customer", "id": self.dough.pk, "name": "Dough Co"},
                "from": {"type": "revenact", "label": "Revenact"},
                "actions": ["add", "assign", "dismiss"],
                "priority": None,
            },
        )
        detail = entry["detail"]
        self.assertEqual(
            (detail["id"], detail["kind"], detail["agent_action"]), (rec.pk, "renewal_due", None)
        )
        self.assertEqual(detail["suggested_assignee"]["id"], self.csm.pk)
        self.assertEqual(set(detail["defaults"]), {"title", "due_date", "priority"})

    def test_only_the_four_kinds(self):
        for kind in (
            "renewal_due",
            "health_drop",
            "urgent_tickets",
            "anomaly",
            "overdue_tasks",
            "open_questions",
        ):
            self.suggestion(self.csm, self.pizza, kind=kind)
        source = self.source(self.csm)
        self.assertEqual(source.count(), 4)
        self.assertEqual(
            sorted(entry["detail"]["kind"] for _key, entry in source.page(None, 10)),
            ["anomaly", "health_drop", "renewal_due", "urgent_tickets"],
        )

    def test_only_the_recipients_and_only_on_records_they_open(self):
        self.suggestion(self.mona, self.soup)
        self.suggestion(self.csm, self.soup)
        source = self.source(self.csm)
        self.assertEqual((source.count(), source.hidden()), (0, 1))
        self.assertEqual(self.source(self.mona).count(), 1)

    def test_newest_first_and_paged(self):
        old = self.suggestion(self.csm, self.pizza)
        new = self.suggestion(self.csm, self.dough)
        self.age(old, 3)
        first = self.source(self.csm).page(None, 1)
        self.assertEqual([entry["id"] for _key, entry in first], [new.pk])
        rest = self.source(self.csm).page(first[-1][0], 10)
        self.assertEqual([entry["id"] for _key, entry in rest], [old.pk])
```

- [ ] **Step 2: Run them to verify they fail**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_suggest --parallel auto --noinput`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.work.feed_suggest'`.

- [ ] **Step 3: Write `services/work/feed_suggest.py`**

```python
"""The feed's suggested group (Work in one place, spec §4.1): open
recommendations sent to the reader (`rec_access.decidable(reader, "me")`)
of the four kinds the feed shows nowhere else, on records they may open,
newest first. Overdue tasks, open questions and agent actions are already
in the feed as themselves, so their recommendations are left out."""

from .clock import working_days_for
from .feed_shape import SUGGESTION, after_q, item, record_ref
from .models import Recommendation
from .rec_access import ME, decidable, openable
from .recommendations import LIST_RELATED, Opens, row_payload

K = Recommendation.Kind
KINDS = (K.RENEWAL_DUE, K.HEALTH_DROP, K.URGENT_TICKETS, K.ANOMALY)
FROM = {"type": "revenact", "label": "Revenact"}
ORDER = ("created_at", "id")


class Suggestions:
    kind = SUGGESTION

    def __init__(self, reader, today):
        self.reader, self.today = reader, today
        self.waiting = decidable(reader, ME).filter(kind__in=KINDS)
        # SOC2:AUTH-02 named only on records the reader may open; the rest counted
        self.readable = openable(reader, self.waiting)

    def count(self):
        return self.readable.count()

    def hidden(self):
        return self.waiting.count() - self.count()

    def page(self, after, limit):
        rows = self.readable.select_related(*LIST_RELATED)
        if after is not None:
            rows = rows.filter(after_q(ORDER, after, descending=True))
        recs = list(rows.order_by("-created_at", "-id")[:limit])
        if not recs:
            return []
        opens = Opens(recs)
        days = working_days_for(self.reader.organisation)
        return [
            (
                (rec.created_at, rec.pk),
                item(
                    key=f"recommendation:{rec.pk}",
                    kind=SUGGESTION,
                    pk=rec.pk,
                    title=rec.title,
                    record=record_ref(rec.record),
                    source=FROM,
                    at=rec.created_at,
                    actions=["add", "assign", "dismiss"],
                    detail=row_payload(
                        rec, today=self.today, opens=opens, working_days=days, reader=self.reader
                    ),
                ),
            )
            for rec in recs
        ]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_suggest --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/work/feed_suggest.py services/work/tests/test_feed_suggest.py
git commit -m "feat(work): the feed's suggested group of four recommendation kinds

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `GET /work/feed/`, its pages and `GET /work/feed/count/`

**Files:**
- Create: `services/work/feed.py`
- Modify: `services/work/views.py`, `services/work/urls.py`
- Create: `services/work/tests/test_feed_api.py`
- Create: `services/work/tests/test_feed_queries.py`

**Interfaces:**
- Consumes: `feed_shape` (Task 4), `feed_tasks.Tasks` (Task 5), `feed_decide.MAKERS` (Task 7), `feed_suggest.Suggestions` (Task 8).
- Produces (in `services.work.feed`): `build(reader, *, today, kinds) -> dict`, `page(reader, *, today, kinds, group, cursor) -> dict`, `count(reader, *, today) -> dict`; routes `work-feed` (`/api/v1/work/feed/`) and `work-feed-count` (`/api/v1/work/feed/count/`).

- [ ] **Step 1: Write the failing API tests**

Create `services/work/tests/test_feed_api.py`:

```python
"""GET /work/feed/ and /work/feed/count/ (contract §2): one list in eight
groups, the kind filter, keyset pages, partial failure, privacy and the
badge."""

import json
from unittest.mock import patch

from django.db import connection
from rest_framework.test import APIClient

from services.accounts.models import User
from services.customers.models import Task
from services.work import feed_decide, feed_tasks
from services.work.feed_shape import GROUPS, STALE_CURSOR
from services.work.tests.feed_fixtures import COUNT, FEED, FeedFixture

CHOOSE_KIND = "Choose approval, rule_review, question, draft, task, todo or suggestion."


class FeedApiTests(FeedFixture):
    def everything(self):
        """One of each kind on Carl's desk, oldest first in the decide group."""
        self.review_ = self.review(self.csm)
        self.action = self.proposal(self.pizza)
        self.asked = self.question(self.csm, customer=self.pizza)
        self.draft = self.reply(self.csm, self.dough)
        for days, row in ((4, self.review_), (3, self.action), (2, self.asked), (1, self.draft)):
            self.age(row, days)
        self.late = self.due(self.csm, self.pizza, due_in=-1)
        self.mine = self.todo(self.csm)
        self.rec = self.suggestion(self.csm, self.dough)

    def test_the_whole_feed(self):
        self.everything()
        body = self.body(self.csm)
        self.assertEqual([g["key"] for g in body["groups"]], list(GROUPS))
        self.assertEqual((body["hidden"], body["failed"]), (0, []))
        decide = self.group(body, "decide")
        self.assertEqual(
            [i["key"] for i in decide["items"]],
            [
                f"rule_review:{self.review_.pk}",
                f"agent_action:{self.action.pk}",
                f"question:{self.asked.pk}",
                f"draft:{self.draft.pk}",
            ],
        )
        self.assertEqual((decide["count"], decide["next"]), (4, None))
        self.assertEqual([i["id"] for i in self.group(body, "overdue")["items"]], [self.late.pk])
        self.assertEqual([i["id"] for i in self.group(body, "no_date")["items"]], [self.mine.pk])
        self.assertEqual([i["id"] for i in self.group(body, "suggested")["items"]], [self.rec.pk])
        for key in ("today", "week", "later", "blocked"):
            self.assertEqual(
                self.group(body, key), {"key": key, "count": 0, "items": [], "next": None}
            )
        keys = [i["key"] for g in body["groups"] for i in g["items"]]
        self.assertEqual(len(keys), len(set(keys)))

    def test_the_kind_filter(self):
        self.everything()
        body = self.body(self.csm, kind="approval,rule_review")
        decide = self.group(body, "decide")
        self.assertEqual([i["kind"] for i in decide["items"]], ["rule_review", "approval"])
        self.assertEqual(decide["count"], 2)
        for key in GROUPS[1:]:
            self.assertEqual(self.group(body, key)["count"], 0)
        todos = self.body(self.csm, kind="todo")
        self.assertEqual([i["id"] for i in self.group(todos, "no_date")["items"]], [self.mine.pk])
        self.assertEqual(self.group(todos, "overdue")["count"], 0)

    def test_refused_queries(self):
        cases = (
            ({"kind": ""}, {"kind": [CHOOSE_KIND]}),
            ({"kind": "approvals"}, {"kind": [CHOOSE_KIND]}),
            (
                {"group": "inbox"},
                {
                    "group": [
                        "Choose decide, overdue, today, week, later, no_date, blocked or suggested."
                    ]
                },
            ),
            ({"cursor": "abc"}, {"cursor": ["Say which group to page."]}),
            ({"group": "decide", "cursor": "abc"}, {"cursor": [STALE_CURSOR]}),
        )
        for params, error in cases:
            response = self.feed(self.csm, **params)
            self.assertEqual((response.status_code, response.json()), (400, error), params)

    def test_a_cursor_for_another_group_is_stale(self):
        for i in range(51):
            self.todo(self.csm, title=f"To-do {i}")
        token = self.group(self.body(self.csm), "no_date")["next"]
        response = self.feed(self.csm, group="today", cursor=token)
        self.assertEqual((response.status_code, response.json()), (400, {"cursor": [STALE_CURSOR]}))

    def test_paging_a_task_group_never_skips_what_was_acted_on(self):
        made = [self.todo(self.csm, title=f"To-do {i}") for i in range(55)]
        first = self.group(self.body(self.csm), "no_date")
        self.assertEqual((first["count"], len(first["items"])), (55, 50))
        Task.objects.filter(pk__in=[made[0].pk, made[1].pk]).update(status="completed")
        second = self.body(self.csm, group="no_date", cursor=first["next"])
        self.assertEqual(second["failed"], [])
        page = second["group"]
        self.assertEqual((page["key"], page["count"], page["next"]), ("no_date", 53, None))
        self.assertEqual([i["id"] for i in page["items"]], [m.pk for m in made[50:]])

    def test_paging_the_decide_group_across_sources(self):
        made = []
        for i in range(30):
            review = self.review(self.csm, name=f"Rule {i}")
            question = self.question(self.csm, customer=self.pizza, text=f"Question {i}")
            self.age(review, 100 - 2 * i)
            self.age(question, 99 - 2 * i)
            made += [f"rule_review:{review.pk}", f"question:{question.pk}"]
        first = self.group(self.body(self.csm), "decide")
        rest = self.body(self.csm, group="decide", cursor=first["next"])["group"]
        self.assertEqual(
            [i["key"] for i in first["items"]] + [i["key"] for i in rest["items"]], made
        )
        self.assertIsNone(rest["next"])

    def test_a_group_without_a_cursor_is_its_first_page(self):
        self.everything()
        body = self.body(self.csm, group="suggested")
        self.assertEqual([i["id"] for i in body["group"]["items"]], [self.rec.pk])

    def test_one_failing_source_leaves_the_rest(self):
        self.everything()
        with (
            patch.object(feed_decide.Approvals, "page", side_effect=RuntimeError("boom")),
            self.assertLogs("services.work.feed", "WARNING") as logs,
        ):
            body = self.body(self.csm)
        self.assertEqual(body["failed"], ["approval"])
        decide = self.group(body, "decide")
        self.assertEqual(decide["count"], 3)
        self.assertNotIn("approval", [i["kind"] for i in decide["items"]])
        self.assertEqual(self.group(body, "overdue")["count"], 1)
        self.assertIn("approval failed: RuntimeError", logs.output[0])

    def test_a_database_error_in_one_source_does_not_poison_the_others(self):
        self.everything()

        def broken(*_args, **_kwargs):
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 / 0")

        with patch.object(feed_decide.Questions, "page", side_effect=broken):
            body = self.body(self.csm)
        self.assertEqual(body["failed"], ["question"])
        self.assertEqual(self.group(body, "suggested")["count"], 1)
        self.assertEqual(self.group(body, "no_date")["count"], 1)

    def test_tasks_and_to_dos_fail_together(self):
        self.everything()
        with patch.object(feed_tasks.Tasks, "counts", side_effect=RuntimeError("boom")):
            body = self.body(self.csm)
        self.assertEqual(body["failed"], ["task", "todo"])
        self.assertEqual(self.group(body, "no_date")["count"], 0)
        self.assertEqual(self.group(body, "decide")["count"], 4)

    def test_nobody_else_sees_a_to_do(self):
        self.todo(self.csm, title="Renew my passport", due_in=-1)
        for reader in (self.mona, self.admin, self.lee, self.other):
            text = json.dumps(self.body(reader))
            self.assertNotIn("Renew my passport", text, reader.name)

    def test_hidden_items_are_counted_never_named(self):
        self.due(self.csm, self.west, due_in=-1, created_by=self.other, title="West handover")
        self.question(self.csm, customer=self.soup, text="Soup secret")
        self.suggestion(self.csm, self.soup, title="Prepare Soup's renewal")
        self.reply(self.csm, self.soup)
        response = self.feed(self.csm)
        self.assertEqual(response.json()["hidden"], 4)
        for name in ("West handover", "Taco West", "Soup secret", "Soup Co"):
            self.assertNotIn(name, response.content.decode())

    def test_an_overdue_task_is_shown_once_and_retired_kinds_never(self):
        task = self.due(self.csm, self.pizza, due_in=-3)
        self.suggestion(self.csm, self.pizza, kind="overdue_tasks")
        body = self.body(self.csm)
        keys = [i["key"] for g in body["groups"] for i in g["items"]]
        self.assertEqual(keys, [f"task:{task.pk}"])

    def test_the_count(self):
        self.everything()
        self.due(self.csm, self.dough, due_in=-5, status="blocked", reason="Legal")
        self.todo(self.csm, due_in=-2)
        response = self.as_user(User.objects.get(pk=self.csm.pk)).get(COUNT)
        self.assertEqual(response.json(), {"decide": 4, "overdue": 2, "badge": 6, "failed": []})
        mona = self.as_user(User.objects.get(pk=self.mona.pk)).get(COUNT)
        self.assertEqual(mona.json(), {"decide": 0, "overdue": 0, "badge": 0, "failed": []})

    def test_a_failing_source_counts_nothing(self):
        self.everything()
        with patch.object(feed_decide.Drafts, "count", side_effect=RuntimeError("boom")):
            response = self.as_user(User.objects.get(pk=self.csm.pk)).get(COUNT)
        self.assertEqual(
            response.json(), {"decide": 3, "overdue": 1, "badge": 4, "failed": ["draft"]}
        )

    def test_signed_out_is_refused(self):
        for url in (FEED, COUNT):
            self.assertEqual(APIClient().get(url).status_code, 401)
```

- [ ] **Step 2: Write the failing query tests**

Create `services/work/tests/test_feed_queries.py`:

```python
"""The feed and its count cost the same however many items wait (contract
§2.7), under a pinned ceiling, and no query uses DISTINCT (Postgres 16)."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.models import User
from services.work.tests.feed_fixtures import COUNT, FEED, FeedFixture

#: Measured on this branch (Task 9, Step 6); raise only with a reason in the commit.
FEED_CEILING = 0
COUNT_CEILING = 0
PAIRS = [
    ("renewal_due", "pizza"),
    ("health_drop", "pizza"),
    ("urgent_tickets", "pizza"),
    ("anomaly", "pizza"),
    ("renewal_due", "dough"),
    ("health_drop", "dough"),
]


class FeedQueryTests(FeedFixture):
    def seed(self, n):
        kind, on = PAIRS[n]
        self.review(self.csm, name=f"Rule {n}")
        self.proposal(self.pizza, title=f"Play {n}")
        self.question(self.csm, customer=self.pizza, text=f"Question {n}")
        self.reply(self.csm, self.dough)
        self.due(self.csm, self.pizza, due_in=-1, title=f"Late {n}")
        self.due(self.csm, self.emea, due_in=3, title=f"Soon {n}")
        self.todo(self.csm, title=f"To-do {n}")
        self.suggestion(self.csm, getattr(self, on), kind=kind)

    def measure(self, url):
        client = self.as_user(User.objects.get(pk=self.csm.pk))
        client.get(url)  # warm per-process caches
        client = self.as_user(User.objects.get(pk=self.csm.pk))
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(client.get(url).status_code, 200)
        return queries

    def check(self, url, ceiling):
        self.seed(0)
        few = self.measure(url)
        for n in range(1, len(PAIRS)):
            self.seed(n)
        many = self.measure(url)
        self.assertEqual(len(few), len(many), [q["sql"] for q in many.captured_queries])
        self.assertLessEqual(len(many), ceiling)
        for query in many.captured_queries:
            self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])

    def test_the_feed_costs_the_same_however_many_items_wait(self):
        self.check(FEED, FEED_CEILING)

    def test_the_count_costs_the_same_however_many_items_wait(self):
        self.check(COUNT, COUNT_CEILING)
```

- [ ] **Step 3: Run them to verify they fail**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_api services.work.tests.test_feed_queries --parallel auto --noinput`
Expected: FAIL — 404 on `/api/v1/work/feed/`.

- [ ] **Step 4: Write `services/work/feed.py`**

```python
"""Work's one feed (Work in one place, spec §4.1, §4.2; contract §2): what
waits on the reader, in eight groups. Each source is built in its own
savepoint, so one failing (even with a database error) only adds its kinds
to `failed`; the response is still complete for the rest.

`build` is the whole feed, `page` one group's page after a cursor, `count`
the badge (counts only)."""

import logging

from django.db import transaction

from . import feed_decide, feed_suggest, feed_tasks
from .feed_shape import (
    DECIDE,
    DECIDE_KINDS,
    KINDS,
    PAGE,
    SUGGESTED,
    SUGGESTION,
    TASK_GROUPS,
    decode,
    group,
)

logger = logging.getLogger(__name__)


def _ordered(failed):
    return [kind for kind in KINDS if kind in failed]


def _attempt(kinds, failed, run):
    """`run()` (which returns a tuple) in a savepoint; None, with `kinds`
    added to `failed`, when it raises."""
    try:
        with transaction.atomic():
            return run()
    except Exception as exc:  # noqa: BLE001 - one source never stops the feed
        logger.warning("work feed: %s failed: %s", ",".join(kinds), type(exc).__name__)
        failed.extend(kinds)
        return None


def _decide(reader, kinds, after, failed):
    """The decide group's payload and its sources' hidden total."""
    count = hidden = 0
    rows = []
    for kind in DECIDE_KINDS:
        if kind not in kinds:
            continue

        def run(kind=kind):
            source = feed_decide.MAKERS[kind](reader)
            return source.count(), source.hidden(), source.page(after, PAGE + 1)

        got = _attempt([kind], failed, run)
        if got is not None:
            count += got[0]
            hidden += got[1]
            rows += got[2]
    rows.sort(key=lambda row: row[0])
    return group(DECIDE, count, rows), hidden


def _tasks(reader, today, kinds, failed, *, only=None, after=None):
    """`{group key: payload}` for the task groups (all, or `only`) and the hidden total."""
    wanted = TASK_GROUPS if only is None else (only,)
    groups = {key: group(key, 0, []) for key in wanted}
    asked = [kind for kind in feed_tasks.Tasks.KINDS if kind in kinds]
    if not asked:
        return groups, 0

    def run():
        source = feed_tasks.Tasks(reader, today, kinds)
        counts = source.counts()
        built = {
            key: group(key, counts[key], source.page(key, after, PAGE + 1) if counts[key] else [])
            for key in wanted
        }
        return built, source.hidden() if only is None else 0

    got = _attempt(asked, failed, run)
    if got is None:
        return groups, 0
    groups.update(got[0])
    return groups, got[1]


def _suggested(reader, today, kinds, after, failed):
    if SUGGESTION not in kinds:
        return group(SUGGESTED, 0, []), 0

    def run():
        source = feed_suggest.Suggestions(reader, today)
        return source.count(), source.hidden(), source.page(after, PAGE + 1)

    got = _attempt([SUGGESTION], failed, run)
    if got is None:
        return group(SUGGESTED, 0, []), 0
    return group(SUGGESTED, got[0], got[2]), got[1]


def build(reader, *, today, kinds):
    failed = []
    decide, decide_hidden = _decide(reader, kinds, None, failed)
    tasks, tasks_hidden = _tasks(reader, today, kinds, failed)
    suggested, suggested_hidden = _suggested(reader, today, kinds, None, failed)
    return {
        "groups": [decide, *(tasks[key] for key in TASK_GROUPS), suggested],
        "hidden": decide_hidden + tasks_hidden + suggested_hidden,
        "failed": _ordered(failed),
    }


def page(reader, *, today, kinds, group_key, cursor):
    """One group's page after `cursor` (None: its first page)."""
    after = None if cursor is None else decode(group_key, cursor)
    failed = []
    if group_key == DECIDE:
        payload, _hidden = _decide(reader, kinds, after, failed)
    elif group_key == SUGGESTED:
        payload, _hidden = _suggested(reader, today, kinds, after, failed)
    else:
        groups, _hidden = _tasks(reader, today, kinds, failed, only=group_key, after=after)
        payload = groups[group_key]
    return {"group": payload, "failed": _ordered(failed)}


def count(reader, *, today):
    """The badge: the decide group's and the overdue group's full counts."""
    failed = []
    decide = 0
    for kind in DECIDE_KINDS:
        got = _attempt(
            [kind], failed, lambda kind=kind: (feed_decide.MAKERS[kind](reader).count(),)
        )
        if got is not None:
            decide += got[0]
    every = frozenset(KINDS)
    got = _attempt(
        list(feed_tasks.Tasks.KINDS),
        failed,
        lambda: (feed_tasks.Tasks(reader, today, every).counts()["overdue"],),
    )
    overdue = 0 if got is None else got[0]
    return {
        "decide": decide,
        "overdue": overdue,
        "badge": decide + overdue,
        "failed": _ordered(failed),
    }
```

- [ ] **Step 5: The views and routes**

In `services/work/views.py`, add `feed` to the `from . import ...` line, and:

```python
from .feed_shape import CHOOSE_GROUP, CURSOR_NEEDS_GROUP, GROUPS, BadQuery, parse_kinds
```

Add after `TodoCreateView`:

```python
class FeedView(APIView):
    """GET /api/v1/work/feed/?kind=&group=&cursor= — the caller's desk in
    eight groups, or (with `group`) one group's page."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        group_key, cursor = params.get("group"), params.get("cursor")
        try:
            kinds = parse_kinds(params.get("kind"))
            if group_key is None and cursor is not None:
                raise BadQuery("cursor", CURSOR_NEEDS_GROUP)
            if group_key is not None and group_key not in GROUPS:
                raise BadQuery("group", CHOOSE_GROUP)
            on = today_for(request.user.organisation)
            if group_key is None:
                return Response(feed.build(request.user, today=on, kinds=kinds))
            return Response(
                feed.page(request.user, today=on, kinds=kinds, group_key=group_key, cursor=cursor)
            )
        except BadQuery as exc:
            raise ValidationError({exc.field: [exc.message]}) from None


class FeedCountView(APIView):
    """GET /api/v1/work/feed/count/ — the Work badge."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        on = today_for(request.user.organisation)
        return Response(feed.count(request.user, today=on))
```

In `services/work/urls.py`, add after the `todos/` path:

```python
(path("feed/", views.FeedView.as_view(), name="work-feed"),)
(path("feed/count/", views.FeedCountView.as_view(), name="work-feed-count"),)
```

- [ ] **Step 6: Run, measure and pin the ceilings**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_api --parallel auto --noinput`
Expected: PASS.

Run: `venv/bin/python manage.py test services.work.tests.test_feed_queries --noinput`
Expected: both tests FAIL at `assertLessEqual(len(many), ceiling)` with `AssertionError: <N> not less than or equal to 0` (the feed's) and `<M> not less than or equal to 0` (the count's). Set `FEED_CEILING = <N>` and `COUNT_CEILING = <M>` (the numbers printed) and run again: PASS. If `len(few) != len(many)`, a source reads per row: fix that source (batch the read) before pinning — never pin a count that grows with items.

- [ ] **Step 7: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/work/feed.py services/work/views.py services/work/urls.py services/work/tests/test_feed_api.py services/work/tests/test_feed_queries.py
git commit -m "feat(work): GET /work/feed/, its pages and /work/feed/count/

Query ceilings pinned at the measured values: feed <N>, count <M>.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Write the measured numbers in place of `<N>` and `<M>`.)

---

### Task 10: Tracking, agents and digest guards for to-dos

**Files:**
- Modify: `services/work/tracking.py` (`run`)
- Modify: `services/work/digest.py` (`contents`)
- Create: `services/work/tests/test_todo_guards.py`
- Create: `services/agents/tests/test_todo_guard.py`

**Interfaces:**
- Consumes: `feed_tasks.Tasks` (`counts`, `tasks`), `task_access.record_of`, `FeedFixture` (Task 5).
- Produces: `digest.contents` counts and names the reader's own to-dos; tracking never reads a dateless or record-less task.

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_todo_guards.py`:

```python
"""To-dos stay where they belong (contract §1): never nudged or escalated,
and counted in their creator's own digest only."""

from datetime import UTC, datetime, time

from services.accounts.models import Organisation
from services.notifications.models import Notification
from services.work import digest, tracking
from services.work.models import WorkSettings
from services.work.prefs import settings_for
from services.work.tests.feed_fixtures import FeedFixture

EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]


class TodoGuardTests(FeedFixture):
    def setUp(self):
        WorkSettings.objects.filter(pk=settings_for(self.org).pk).update(working_days=EVERY_DAY)

    def test_a_to_do_is_never_nudged_or_escalated(self):
        self.todo(self.csm, title="Renew passport", due_in=-9)
        self.todo(self.csm, title="Someday")
        now = datetime.combine(self.today, time(10, 0), tzinfo=UTC)
        result = tracking.run(Organisation.objects.get(pk=self.org.pk), now=now)
        self.assertEqual((result.nudged, result.escalated, result.failed), (0, 0, []))
        self.assertFalse(Notification.objects.exists())

    def test_the_digest_counts_and_names_the_readers_own_to_dos(self):
        self.due(self.csm, self.pizza, due_in=-2, title="Call Pizza Hut", priority="high")
        self.todo(self.csm, title="Renew passport", due_in=-1)
        self.todo(self.csm, title="Pay the invoice", due_in=0)
        self.todo(self.csm, title="Someday")
        subject, body = digest.contents(self.csm, today=self.today)
        self.assertIn("2 overdue\n1 due today", body)
        self.assertIn("- Call Pizza Hut (Pizza Hut), due", body)
        self.assertIn("- Renew passport, due", body)
        self.assertIn("- Pay the invoice\n", body)
        self.assertNotIn("Someday", body)
        self.assertIn("2 overdue, 1 due today", subject)

    def test_nobody_elses_digest_counts_them(self):
        self.todo(self.csm, title="Renew passport", due_in=-1)
        for reader in (self.mona, self.admin, self.lee):
            self.assertIsNone(digest.contents(reader, today=self.today), reader.name)
```

Create `services/agents/tests/test_todo_guard.py`:

```python
"""No agent action may target a to-do (contract §1): the agents' evidence
never holds one, so a proposal naming one is dropped at validation, and an
action can never resolve to one."""

from datetime import timedelta

from services.agents import evidence
from services.agents.actions.tasks import complete_validate, redate_validate
from services.agents.kinds import Invalid
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import Task


class TodoGuardTests(AgentsFixture):
    def setUp(self):
        self.todo = Task.objects.create(
            title="Renew passport",
            assignee=self.csm,
            assignee_name=self.csm.name,
            created_by=self.csm,
            due_date=self.today - timedelta(days=1),
            priority="high",
        )
        self.ctx = evidence.build(self.org, "cs", today=self.today)
        self.row = self.ctx.records[evidence._ref("customer", self.pizza.pk)]

    def test_the_evidence_never_holds_a_to_do(self):
        self.assertNotIn(self.todo.pk, self.ctx.tasks)
        self.assertNotIn("Renew passport", str(self.ctx.records))

    def test_a_proposal_naming_a_to_do_is_dropped(self):
        payload = {
            "task_id": self.todo.pk,
            "due_date": (self.today + timedelta(days=3)).isoformat(),
        }
        for validate in (complete_validate, redate_validate):
            with self.assertRaises(Invalid):
                validate(payload, self.row, self.ctx, None)
```

- [ ] **Step 2: Run them to verify they fail (or pin)**

Run: `venv/bin/python manage.py test services.work.tests.test_todo_guards services.agents.tests.test_todo_guard --parallel auto --noinput`
Expected: `test_the_digest_counts_and_names_the_readers_own_to_dos` FAILS (the digest reads `/work/today`'s build, which has no to-dos); the tracking, nobody-else and agents tests already PASS (they pin behaviour that Tasks 1–2 guarantee; keep them as guards).

- [ ] **Step 3: Tracking reads only dated tasks, explicitly**

In `services/work/tracking.py`, `run`, change the overdue query's filter line:

```python
        open_tasks(workspace_tasks(organisation))
        .filter(overdue_q(today), assignee__isnull=False, due_date__isnull=False)
```

and add to the module docstring: `A to-do (no record) is never on a workspace's books (`workspace_tasks`), and a task with no date is never overdue: neither is tracked.`

- [ ] **Step 4: The digest reads the feed's tasks**

In `services/work/digest.py`:

Replace `from datetime import date, timedelta` with `from datetime import timedelta`, remove `from . import today as today_list`, and add:

```python
from services.customers.task_access import record_of

from .feed_shape import TASK, TODO
from .feed_tasks import Tasks
```

Update the module docstring's "built through the same functions as `/work/today` and `/work/recommendations/`" to "built through the feed's own task source (`feed_tasks.Tasks`: the reader's tasks and their own to-dos) and `/work/recommendations/`'s rules".

Replace `contents` with:

```python
def contents(reader, *, today):
    """(subject, body) for `reader` on `today`, or None with nothing to report."""
    tasks = Tasks(reader, today, frozenset({TASK, TODO}))
    counts = tasks.counts()
    # SOC2:AUTH-02 the badge's own count: what the reader may decide, on records they open
    waiting = openable(reader, decidable(reader, default_scope(reader))).count()
    overdue, due, blocked = counts["overdue"], counts["today"], counts["blocked"]
    if not (overdue or due or blocked or waiting):
        return None
    lines = [
        line
        for line, n in (
            (f"{overdue} overdue", overdue),
            (f"{due} due today", due),
            (f"{plural(waiting, 'recommendation')} waiting", waiting),
            (f"{blocked} blocked", blocked),
        )
        if n
    ]
    named = [("Overdue", task) for task in tasks.tasks("overdue", None, NAMED)]
    named += [("Due today", task) for task in tasks.tasks("today", None, NAMED)]
    items, heading = [], None
    for group, task in named[:NAMED]:
        if group != heading:
            items.append(group)
            heading = group
        when = "" if group == "Due today" else f", due {_item_date(task.due_date)}"
        record = record_of(task)
        where = "" if record is None else f" ({record.name})"
        items.append(f"- {task.title}{where}{when}")
    head = [p for p, n in ((f"{overdue} overdue", overdue), (f"{due} due today", due)) if n]
    if head:
        tail = ", ".join(head)
    elif waiting:
        tail = f"{plural(waiting, 'recommendation')} waiting"
    else:
        tail = f"{blocked} blocked"
    subject = f"Your work for {_short(today)}: {tail}"
    body = "\n".join(
        [
            *lines,
            "",
            *items,
            *([""] if items else []),
            f"Open Work: {settings.FRONTEND_URL}/work/today",
            "",
            "You get this because daily digests are on for your workspace.",
        ]
    )
    return subject, body
```

(The link stays `/work/today` in this delivery: contract Decision 17.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.work services.agents --parallel auto --noinput`
Expected: PASS (`test_digest` keeps passing: Carl's counts and lines are unchanged in WorkFixture's world).

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/work/tracking.py services/work/digest.py services/work/tests/test_todo_guards.py services/agents/tests/test_todo_guard.py
git commit -m "feat(work): the digest counts the reader's own to-dos; tracking and agents never touch one

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The end-to-end journey

**Files:**
- Create: `e2e/test_work_one_place_flow.py`

**Interfaces:**
- Consumes: every route above, `/agents/actions/<id>/approve/`, `PATCH /tasks/<id>/`; `services.work.tests.recommend_fixtures.task_proposal`.

- [ ] **Step 1: Write the test**

```python
"""End-to-end tier: real server, real HTTP, real test DB.

Carl writes himself a to-do: it is on his My work, private, and his manager
Mona cannot open it. A task of his on Pizza Hut is overdue and an agent
proposes work there: the badge says two. He approves the proposal through
its own route, finishes the task and ticks the to-do; the badge drops to
nothing and the approved proposal's task waits in Later."""

import json
from datetime import timedelta
from decimal import Decimal

from django.test import LiveServerTestCase
from django.utils import timezone

from e2e.http import http_get, http_patch, http_post
from services.accounts.models import User
from services.billing.models import BillingAccount
from services.customers.models import Customer
from services.work.tests.recommend_fixtures import task_proposal


class WorkOnePlaceFlowTests(LiveServerTestCase):
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

    @staticmethod
    def group(body, key):
        return next(g for g in body["groups"] if g["key"] == key)

    def test_full_flow(self):
        # 1. The workspace, Mona above Carl, Carl's Pizza Hut.
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
        User.objects.filter(pk=carl.pk).update(reports_to=mona)
        pizza = Customer.objects.create(
            organisation=carl.organisation,
            name="Pizza Hut",
            owner=carl,
            arr_billed_at_account=Decimal(300_000),
        )
        tokens = {who: self.login(f"{who}@acme.io") for who in ("mona", "carl")}
        today = timezone.localdate()

        # 2. A private to-do.
        status, made = http_post(
            self.api("/work/todos/"), {"title": "Book the QBR room"}, token=tokens["carl"]
        )
        self.assertEqual(status, 201, made)
        todo_id = made["task"]["id"]
        self.assertEqual(
            (made["group"], made["item"]["kind"], made["item"]["private"]),
            ("no_date", "todo", True),
        )
        status, _body = http_get(self.api(f"/tasks/{todo_id}/"), token=tokens["mona"])
        self.assertEqual(status, 404)

        # 3. Work arrives: an overdue task on Pizza Hut and an agent's proposal there.
        status, made = http_post(
            self.api("/work/todos/"),
            {
                "title": "Call the sponsor",
                "customer_id": pizza.pk,
                "due_date": (today - timedelta(days=1)).isoformat(),
                "priority": "high",
            },
            token=tokens["carl"],
        )
        self.assertEqual((status, made["group"], made["item"]["kind"]), (201, "overdue", "task"))
        task_id = made["task"]["id"]
        action = task_proposal(carl.organisation, pizza)
        status, count = http_get(self.api("/work/feed/count/"), token=tokens["carl"])
        self.assertEqual(count, {"decide": 1, "overdue": 1, "badge": 2, "failed": []})

        # 4. One feed: the decision on top, the task overdue, the to-do undated.
        status, feed = http_get(self.api("/work/feed/"), token=tokens["carl"])
        self.assertEqual(status, 200, feed)
        (approval,) = self.group(feed, "decide")["items"]
        self.assertEqual(
            (approval["key"], approval["actions"]),
            (f"agent_action:{action.pk}", ["approve", "reject"]),
        )
        self.assertEqual([i["id"] for i in self.group(feed, "overdue")["items"]], [task_id])
        self.assertEqual([i["id"] for i in self.group(feed, "no_date")["items"]], [todo_id])
        status, mona_feed = http_get(self.api("/work/feed/"), token=tokens["mona"])
        self.assertNotIn("Book the QBR room", json.dumps(mona_feed))

        # 5. Act through each item's own route.
        status, body = http_post(
            self.api(f"/agents/actions/{action.pk}/approve/"), {}, token=tokens["carl"]
        )
        self.assertEqual(status, 200, body)
        for pk in (task_id, todo_id):
            status, body = http_patch(
                self.api(f"/tasks/{pk}/"), {"status": "completed"}, token=tokens["carl"]
            )
            self.assertEqual((status, body["status"]), (200, "completed"))

        # 6. Nothing waits; the approved proposal's task is in Later.
        status, count = http_get(self.api("/work/feed/count/"), token=tokens["carl"])
        self.assertEqual(count, {"decide": 0, "overdue": 0, "badge": 0, "failed": []})
        status, feed = http_get(self.api("/work/feed/"), token=tokens["carl"])
        self.assertEqual(self.group(feed, "no_date")["count"], 0)
        self.assertEqual(
            [i["title"] for i in self.group(feed, "later")["items"]], ["Call the exec sponsor"]
        )
```

- [ ] **Step 2: Run it**

Run: `venv/bin/python manage.py test e2e.test_work_one_place_flow --noinput`
Expected: PASS (every route exists by now; this test is the journey's proof, so it is written after them). If step 6's Later assertion fails because the approved task went to someone else, check `task_proposal`'s `assignee_name` ("Carl CSM") matches the member's name exactly.

- [ ] **Step 3: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add e2e/test_work_one_place_flow.py
git commit -m "test(e2e): Work in one place: to-do, feed, approve, finish, badge

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Docs, the full suite and the local database

**Files:**
- Modify: `docs/API_CONTRACTS.md` (section `## \`work\` — Work ...`, ~L9132; the customers Task section where the record task routes are documented)
- Modify: `docs/audit-events.md` (`task.update` row, ~L106)
- Modify: `docs/data-classification.md` (`customers.Task` row, ~L34)
- Modify: `docs/product/05-backend-schema.md` (`Task` row, ~L205)
- Modify: `docs/product/02-trd.md` (`services/work/` row, ~L116)
- Modify: `docs/product/06-implementation-plan.md` (Work section, near L363)
- Modify: `docs/product/01-prd.md` (the Work section)
- Modify: `.soc2/CONTROL_MAP.md` (AUTH-02 row, ~L20)

- [ ] **Step 1: `docs/API_CONTRACTS.md`**

1. Rename the `work` section heading to ``## `work` — Work (`/work/today`, `/work/team`, `/work/recommended`, My work's feed, the task panel)``.
2. In its "Shared shapes" TaskRow JSON add `"private": false` after `"plan": null`, and under it the bullets: "`private`: `true` for a to-do (a task with no record: its creator's alone). A to-do's `parent` is `null` and its `due_date` may be `null`; every other task has both."
3. Append a subsection `### Work in one place, delivery 1 (2026-10-12)` to the `work` section, whose body is sections 1 and 2 of `docs/superpowers/plans/2026-10-12-work-one-place-api.md` copied verbatim (from "## 1. To-dos" through the end of "### 2.7 Performance", demoting each heading one level), then the line: "Decisions and their costs: `docs/superpowers/plans/2026-10-12-work-one-place-api.md` §3." In the copied §2.7, replace "set at the measured value (Task 9 of the backend plan)" with the two measured numbers from Task 9.
4. Where the record task routes (`/customers/<id>/tasks/`, `/accounts/<id>/tasks/`, `/tasks/`) are documented, add: "Never returns a to-do (Work in one place). `due_date` stays required on create."
5. In the task panel's `PATCH /api/v1/tasks/<id>/` text, add: "On a to-do also `customer_id` or `account_id` (attach a record) and `due_date: null`; see Work in one place, delivery 1."

- [ ] **Step 2: The other docs**

- `docs/audit-events.md`, `task.update` row, metadata cell: `fields` gains `record` (a record attached to a to-do).
- `docs/data-classification.md`, `customers.Task` row, append: "A task with no record is a **to-do**: readable by its creator only (not their managers, view-all or Leadership; `task_access.readable_tasks`), never sent to the agents, Copilot, Brain or a record list, and counted only in its creator's own feed and digest."
- `docs/product/05-backend-schema.md`, `Task` row: replace "Index `(assignee, status, due_date)`" with "At most one of `customer`/`account` (`task_at_most_one_parent`); with neither it is a to-do, its creator's alone; `due_date` may be null only on a to-do (`task_dated_unless_todo`). Index `(assignee, status, due_date)`".
- `docs/product/02-trd.md`, `services/work/` row, append: "Work in one place (delivery 1, 2026-10-12): `feed.py` composes `GET /work/feed/` and `/work/feed/count/` from `feed_decide` (Brain's desk sources on the reader's Me desk, plus their own open reply drafts), `feed_tasks` (open tasks assigned to the reader and their own to-dos, in six date groups; one aggregate query for the counts) and `feed_suggest` (four recommendation kinds), each in its own savepoint so one failing source only adds its kinds to `failed`; pages are keyset cursors (`feed_shape`), never offsets; `todos.py` is `POST /work/todos/`. The digest reads `feed_tasks`, so it counts the reader's own to-dos."
- `docs/product/06-implementation-plan.md`: add a line after the Work deliveries: "Work in one place, delivery 1 (2026-10-12, backend): personal to-dos, `POST /work/todos/`, `GET /work/feed/` and `/work/feed/count/`. Delivery 2 (Team queue, retired recommendation kinds, removing `/brain/waiting/*` and `/work/today/`) follows the delivery-1 frontend."
- `docs/product/01-prd.md`, Work section: add "A person can write a to-do for themselves with or without an organisation or account; without one it is private to them. My work lists everything waiting on them in one feed: decisions, overdue and dated tasks, to-dos and suggestions, with one badge."
- `.soc2/CONTROL_MAP.md`, AUTH-02 evidence cell: after "`visible_tasks` (creator or assignee + chains)" add "; to-dos (no record) creator-only through `services/customers/task_access.py:readable_tasks`, never through `visible_tasks`; My work's feed reuses every source's rule (`services/work/feed_*.py`)".

- [ ] **Step 3: Check the schema matches the prose**

Run: `venv/bin/python manage.py shell -c "from django.test import Client; r = Client().get('/api/schema/'); print(r.status_code, b'/api/v1/work/feed/' in r.content, b'/api/v1/work/todos/' in r.content)"`
Expected: `200 True True` (APIViews without serializers show as untyped, as the other Work views do).

- [ ] **Step 4: Lint and migrations**

Run: `venv/bin/ruff check . && venv/bin/ruff format --check . && venv/bin/python manage.py makemigrations --check --dry-run`
Expected: `All checks passed!`, all files formatted, `No changes detected`.

- [ ] **Step 5: The full suite**

Run: `venv/bin/python manage.py test --parallel auto --noinput`
Expected: every test passes (the run prints `OK`). Fix any failure before going on; a failure in a test this plan did not touch means an existing reader changed — find it with `systematic-debugging`, do not loosen the test.

- [ ] **Step 6: Migrate the local dev database**

Run: `venv/bin/python manage.py migrate --noinput`
Expected: `Applying customers.0061_task_todo... OK`. Then `venv/bin/python manage.py showmigrations customers | tail -2` shows `[X] 0061_task_todo`.

- [ ] **Step 7: Commit**

```bash
git add docs/API_CONTRACTS.md docs/audit-events.md docs/data-classification.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md docs/product/06-implementation-plan.md .soc2/CONTROL_MAP.md
git commit -m "docs: Work in one place delivery 1 (to-dos, the feed, the count)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (done while writing)

- **Spec coverage (§8 item 1):** model changes and migration test (Task 1); visibility, to-dos absent from Copilot, record feeds, Brain and Work lists (Task 2); panel edit/complete/attach (Task 3); `POST /work/todos/` (Task 6); feed per kind, ordering, grouping incl. no_date, paging, kind filter, partial failure, hidden, privacy, no duplicates (Tasks 5, 7, 8, 9); count (Task 9); query ceilings and no DISTINCT (Task 9); tracking, agents and digest guards (Task 10); e2e journey (Task 11); docs (Task 12). Exports read no tasks (checked: `services/organizations/export.py` never imports `Task`), so the guard is Task 2's `visible_tasks` rule. Not in D1, so not here: `/work/feed/team/`, retired kinds, removals.
- **Placeholders:** the only measured values are the two query ceilings, with the exact procedure in Task 9 Step 6 (the spec requires "ceiling set after measuring").
- **Names:** `todo_q`, `is_todo`, `readable_tasks`, `record_for`, `TODO_ONLY_YOURS`, `RECORD_YOU_CAN_OPEN`, `ONE_RECORD`, `RECORD_FIXED` (Tasks 2–3) are used unchanged in Tasks 5, 6, 10; `Tasks.KINDS`, `Tasks.asked`, `.counts()`, `.hidden()`, `.tasks()`, `.page()` (Task 5) match Tasks 6, 9, 10; `MAKERS`, `.count/.hidden/.page` (Task 7) match Task 9; `Suggestions(reader, today)` (Task 8) matches Task 9; `feed.page(..., group_key=...)` matches the view.
