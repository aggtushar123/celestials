# Slack escalations, delivery 2 (backend): Account team and department heads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each function (department) of a workspace can have one head, read by every member and named by an organisation-settings manager, with every change audited; `handler_for(customer_or_account, function)` answers who handles a record in a function (the account team first, then the department head, then nobody, skipping people who left or moved), ready for the D3 escalation bundle; changes to a customer's account team are audited.

**Architecture:** One new model, `knowledge.FunctionHead` (`services/knowledge/models.py`), and one small module, `services/knowledge/heads.py` (`on_duty`, `head_for`, `rows`, `change`), which the new `FunctionHeadsView` (`GET/PATCH /api/v1/function-heads/`, in `services/knowledge/views.py`, mounted by `services/knowledge/urls.py`) and `ownership.handler_for` share. The existing `CustomerResponsibleView.patch` gains one audit call. No change to any other app.

**Tech Stack:** Python 3.13, Django 5.2, DRF 3.18, Postgres 16 (CI/prod; local may be 15). Tests: `django.test`, `rest_framework.test`, `LiveServerTestCase` + `e2e/http.py`.

**Spec:** react-ts-app `docs/superpowers/specs/2026-10-15-slack-escalations-design.md` §2 (decisions 3, 9), §4 (D2), §9 (D2 row), §10, §11 step 2, §14 Q1, on its `main`. **Binding contract:** `docs/superpowers/plans/2026-10-15-slack-escalations-d2-api.md` (this repo). Read its "What the merged code does today" and "Decisions narrowing the spec" (SE2-1 to SE2-11) before any task; every decision is a requirement here.

## Global Constraints

- Work only in `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/slackd2-be` on branch `feat/slack-escalations-d2` (cut from main 7fabf66: D1 #124 merged; its first commit holds this plan and the contract). Never merge, never open a PR, never touch the servers on ports 8000 or 5173 (the owner uses them).
- Python: link the venv once, `ln -s ../main-be/venv venv` (the `venv/` ignore rule does not match a symlink: never `git add` it). Written `PY` below: `PY=venv/bin/python`. Ruff: `venv/bin/ruff`.
- `.env` (copy `../main-be/.env` if absent; never commit it) points at the shared dev database `revenact`: **never migrate it, never write to it.** Tests use their own test database.
- Run tests as `$PY manage.py test <labels> --parallel auto --noinput`. Never the whole suite serially (it passes the 30-minute mark).
- **Mac hang workaround:** a `--parallel auto` run sometimes stalls (no new output, CPU idle). After about 10 minutes with no progress, `pkill -f "manage.py test"` and run the same command again; a second stall on the same labels: run them with `--parallel 1` to find the test.
- Lint before each commit: `venv/bin/ruff check . && venv/bin/ruff format --check .` (`ruff format` also formats Python blocks inside Markdown; run `venv/bin/ruff format .` if the check fails, docs included).
- Every commit message is a conventional commit (`commit-messages` skill) and ends with exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Stage explicit paths (`git add <paths>`); never `git add -A` or `git add .`. Never `git stash` (shared across worktrees).
- **CI is blocked by GitHub billing:** local checks are the gate. A task is done only when its tests pass locally; the last task runs the full suite (`--parallel auto`), `makemigrations --check`, `manage.py spectacular` and ruff.
- **Nothing real is sent**; no test calls a model, Slack or Jira (this delivery calls none).
- **Postgres 16:** no `DISTINCT`, no join made unique; filters by column. Query counts are pinned exactly (SE2-8): if a measured count differs from this plan's number, read the SQL in the failure message and remove the extra query (a `select_related`, an `_id` instead of an object); change a pin only when the extra query is necessary, and record it in the contract's "Changes during the build".
- Every capability gate carries `# SOC2:AUTH-02 ...`; every audited write `# SOC2:LOG-01 ...`. Audit metadata holds ids, never a name or an email.
- User-facing sentences are exactly the contract's (§2 refusals). No em dash in any sentence a person reads.
- No new dependency, no new env var. One migration: `knowledge.0006_functionhead` (from `makemigrations knowledge`).
- **Product documents rule:** `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/data-classification.md`, `.soc2/CONTROL_MAP.md`, `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md` are updated in this PR (Task 6).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `services/knowledge/models.py`, `migrations/0006_functionhead.py` | modify/create | `FunctionHead` (contract §1.1, SE2-2, SE2-3) |
| `services/knowledge/heads.py` | create | `on_duty`, `head_for`, `rows`, `change` (SE2-4 to SE2-6) |
| `services/knowledge/serializers.py` | modify | `FunctionHeadChangeSerializer` |
| `services/knowledge/views.py` | modify | `FunctionHeadsView`; `CustomerResponsibleView.patch` audits (SE2-9) |
| `services/knowledge/urls.py` | modify | `function-heads/` |
| `services/knowledge/ownership.py` | modify | `handler_for` (SE2-7) |
| `services/knowledge/tests/heads_fixtures.py` | create | `HeadsFixture` |
| `services/knowledge/tests/test_function_heads.py` | create | model and `heads` module |
| `services/knowledge/tests/test_function_heads_views.py` | create | the route, rights, refusals, audit, ceiling |
| `services/knowledge/tests/test_handler_for.py` | create | `handler_for` order, account rule, ceilings |
| `services/knowledge/tests/test_account_team_audit.py` | create | `function_owner.changed` |
| `e2e/test_account_team_flow.py` | create | the journey |
| docs | modify | Task 6 |

## Shared test fixture (new, Task 1)

`services/knowledge/tests/heads_fixtures.py` `HeadsFixture(APITestCase)`: workspace "Alfiee QA" with Alice (`self.alice`, admin, Leadership), Faiz (`self.faiz`, CSM, Customer Success, owns Globex), Carl (`self.carl`, CSM, Customer Success, owns Initech), Jesh (`self.jesh`, CSM, Engineering), Erin (`self.erin`, CSM, Engineering); Zed (`self.zed`, Engineering) in another workspace "Elsewhere" (`self.elsewhere`); customers `self.globex` "Globex (QA)" and `self.initech` "Initech (QA)". Helpers `person(email, name, function, role=CSM)`, `account(name, *parents, owner=None)`, `as_(user)` (an authenticated `APIClient`), `fresh(record)` (the record read again, nothing cached). The CSM role has no `manage_org_settings` and no `view_all_accounts`; the admin role has both. Fake people and companies only.

---

### Task 1: `FunctionHead` and the heads module

**Files:**
- Modify: `services/knowledge/models.py` (append after `AccountBrief`, the file's last class)
- Create: `services/knowledge/migrations/0006_functionhead.py` (`makemigrations knowledge`), `services/knowledge/heads.py`, `services/knowledge/tests/heads_fixtures.py`, `services/knowledge/tests/test_function_heads.py`

**Interfaces:**
- Produces: `knowledge.models.FunctionHead` (fields per contract §1.1; `clean()` raises `ValidationError({"user": <sentence>})`; `save()` calls `clean()`).
- Produces: `heads.on_duty(user, function=None) -> bool`; `heads.head_for(organisation_id, function) -> User | None` (one query); `heads.rows(organisation_id) -> list[dict]` (six rows, one query); `heads.change(organisation, function, user_or_none, *, request) -> None` (raises the model's `ValidationError`; audits only a real change).
- Produces (tests): `heads_fixtures.HeadsFixture` (see "Shared test fixture").

- [ ] **Step 1: Write the failing tests**

Create `services/knowledge/tests/heads_fixtures.py`:

```python
"""A workspace for the account team and department heads (Slack
escalations D2). Fake people and companies; nothing leaves the test."""

from rest_framework.test import APIClient, APITestCase

from services.accounts.models import Organisation, User
from services.customers.models import Account, Customer


class HeadsFixture(APITestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name="Alfiee QA")
        self.alice = self.person(
            "alice@alfiee.example", "Alice Admin", User.Function.LEADERSHIP, User.Role.ADMIN
        )
        self.faiz = self.person("faiz@alfiee.example", "Faiz Jamal", User.Function.CS)
        self.carl = self.person("carl@alfiee.example", "Carl CSM", User.Function.CS)
        self.jesh = self.person("jesh@alfiee.example", "Jesh Sanghvi", User.Function.ENGINEERING)
        self.erin = self.person("erin@alfiee.example", "Erin Engineer", User.Function.ENGINEERING)
        self.elsewhere = Organisation.objects.create(name="Elsewhere")
        self.zed = User.objects.create_user(
            email="zed@elsewhere.example",
            password="x",
            name="Zed Outsider",
            organisation=self.elsewhere,
            role=User.Role.ADMIN,
            function=User.Function.ENGINEERING,
        )
        self.globex = Customer.objects.create(
            organisation=self.org, name="Globex (QA)", owner=self.faiz
        )
        self.initech = Customer.objects.create(
            organisation=self.org, name="Initech (QA)", owner=self.carl
        )

    def person(self, email, name, function, role=User.Role.CSM):
        return User.objects.create_user(
            email=email,
            password="x",
            name=name,
            organisation=self.org,
            role=role,
            function=function,
        )

    def account(self, name, *parents, owner=None):
        made = Account.objects.create(name=name, owner=owner)
        made.customers.set(parents)
        return made

    @staticmethod
    def as_(user):
        api = APIClient()
        api.force_authenticate(user)
        return api

    @staticmethod
    def fresh(record):
        """The record read again: no related row cached (for query pins)."""
        return type(record).objects.get(pk=record.pk)
```

Create `services/knowledge/tests/test_function_heads.py`:

```python
"""Slack escalations D2 contract §1.1, SE2-2 to SE2-6: one head per
function per workspace, an active member of that function, off duty once
they leave or move, every real change audited."""

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from core.models import AuditEvent
from services.accounts.models import User
from services.knowledge import heads
from services.knowledge.models import FunctionHead
from services.knowledge.tests.heads_fixtures import HeadsFixture


class FunctionHeadModelTests(HeadsFixture):
    def test_the_head_works_in_the_function(self):
        with self.assertRaises(ValidationError) as refused:
            FunctionHead(organisation=self.org, function="engineering", user=self.faiz).save()
        self.assertEqual(
            refused.exception.message_dict["user"],
            ["Faiz Jamal is in Customer Success, not Engineering. Pick someone from Engineering."],
        )

    def test_the_head_is_active(self):
        User.objects.filter(pk=self.jesh.pk).update(is_active=False)
        self.jesh.refresh_from_db()
        with self.assertRaises(ValidationError) as refused:
            FunctionHead(organisation=self.org, function="engineering", user=self.jesh).save()
        self.assertEqual(
            refused.exception.message_dict["user"],
            ["Jesh Sanghvi is deactivated. Pick an active member."],
        )

    def test_the_head_is_a_member_of_the_workspace(self):
        with self.assertRaises(ValidationError) as refused:
            FunctionHead(organisation=self.org, function="engineering", user=self.zed).save()
        self.assertEqual(refused.exception.message_dict["user"], ["No such member."])

    def test_one_head_per_function_per_workspace(self):
        FunctionHead.objects.create(organisation=self.org, function="engineering", user=self.jesh)
        with self.assertRaises(IntegrityError), transaction.atomic():
            FunctionHead.objects.create(
                organisation=self.org, function="engineering", user=self.erin
            )
        # Another workspace has its own.
        FunctionHead.objects.create(
            organisation=self.elsewhere, function="engineering", user=self.zed
        )


class HeadsModuleTests(HeadsFixture):
    def test_rows_are_the_six_functions_in_order(self):
        FunctionHead.objects.create(organisation=self.org, function="engineering", user=self.jesh)
        # Another workspace's head: never read here.
        FunctionHead.objects.create(
            organisation=self.elsewhere, function="engineering", user=self.zed
        )
        with self.assertNumQueries(1):
            answer = heads.rows(self.org.id)
        self.assertEqual(
            [row["function"] for row in answer],
            ["cs", "engineering", "sales", "analytics", "leadership", "other"],
        )
        self.assertEqual(
            answer[0], {"function": "cs", "function_display": "Customer Success", "user": None}
        )
        self.assertEqual(answer[1]["user"], {"id": self.jesh.id, "name": "Jesh Sanghvi"})
        self.assertTrue(all(row["user"] is None for row in answer[2:]))

    def test_a_head_who_left_or_moved_is_off_duty(self):
        FunctionHead.objects.create(organisation=self.org, function="engineering", user=self.jesh)
        FunctionHead.objects.create(organisation=self.org, function="cs", user=self.faiz)
        User.objects.filter(pk=self.jesh.pk).update(is_active=False)
        User.objects.filter(pk=self.faiz.pk).update(function=User.Function.SALES)
        answer = {row["function"]: row["user"] for row in heads.rows(self.org.id)}
        self.assertIsNone(answer["engineering"])
        self.assertIsNone(answer["cs"])
        self.assertIsNone(heads.head_for(self.org.id, "engineering"))
        self.assertIsNone(heads.head_for(self.org.id, "cs"))
        # The rows stay: naming someone else replaces them (SE2-4).
        self.assertEqual(FunctionHead.objects.filter(organisation=self.org).count(), 2)

    def test_head_for_is_one_query_and_reads_only_its_workspace(self):
        FunctionHead.objects.create(
            organisation=self.elsewhere, function="engineering", user=self.zed
        )
        with self.assertNumQueries(1):
            self.assertIsNone(heads.head_for(self.org.id, "engineering"))
        FunctionHead.objects.create(organisation=self.org, function="engineering", user=self.jesh)
        self.assertEqual(heads.head_for(self.org.id, "engineering"), self.jesh)
        self.assertIsNone(heads.head_for(None, "engineering"))

    def test_on_duty(self):
        self.assertTrue(heads.on_duty(self.jesh))
        self.assertTrue(heads.on_duty(self.jesh, "engineering"))
        self.assertFalse(heads.on_duty(self.jesh, "sales"))
        self.assertFalse(heads.on_duty(None))
        self.jesh.is_active = False
        self.assertFalse(heads.on_duty(self.jesh))

    def test_change_sets_replaces_and_clears_with_one_audit_row_each(self):
        heads.change(self.org, "engineering", self.jesh, request=None)
        heads.change(self.org, "engineering", self.jesh, request=None)  # the same: no row
        heads.change(self.org, "engineering", self.erin, request=None)
        heads.change(self.org, "engineering", None, request=None)
        heads.change(self.org, "engineering", None, request=None)  # already nobody: no row
        self.assertFalse(FunctionHead.objects.filter(organisation=self.org).exists())
        events = list(AuditEvent.objects.filter(action="function_head.changed").order_by("id"))
        self.assertEqual(
            [e.metadata for e in events],
            [
                {"function": "engineering", "from": None, "to": self.jesh.id},
                {"function": "engineering", "from": self.jesh.id, "to": self.erin.id},
                {"function": "engineering", "from": self.erin.id, "to": None},
            ],
        )
        self.assertTrue(all(e.organisation_id == self.org.id for e in events))
        self.assertTrue(all(e.target_type == "accounts.organisation" for e in events))

    def test_a_refused_change_changes_nothing(self):
        heads.change(self.org, "engineering", self.jesh, request=None)
        with self.assertRaises(ValidationError):
            heads.change(self.org, "engineering", self.faiz, request=None)
        self.assertEqual(heads.head_for(self.org.id, "engineering"), self.jesh)
        self.assertEqual(AuditEvent.objects.filter(action="function_head.changed").count(), 1)
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.knowledge.tests.test_function_heads --parallel auto --noinput`
Expected: FAIL: `ImportError: cannot import name 'heads' from 'services.knowledge'` (and `FunctionHead`).

- [ ] **Step 3: The model, the migration and the module**

Append to `services/knowledge/models.py`:

```python
class FunctionHead(models.Model):
    """The head of one function (department) in a workspace (Slack
    escalations D2, contract §1.1): who takes a customer's escalation in
    that function when nobody on the customer's account team works in it
    (`ownership.handler_for`). One per function per workspace; clearing a
    head deletes the row. The head is an active member working in the
    function, checked on save (`clean`) and again on every read
    (`heads.on_duty`), since people move between functions and leave."""

    organisation = models.ForeignKey(
        Organisation, related_name="function_heads", on_delete=models.CASCADE
    )
    function = models.CharField(max_length=16, choices=User.Function.choices)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="function_headships", on_delete=models.CASCADE
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "function"],
                name="one_head_per_function_per_organisation",
            )
        ]

    def __str__(self):
        return f"{self.get_function_display()} head: {self.user}"

    def clean(self):
        if self.user.organisation_id != self.organisation_id:
            raise ValidationError({"user": "No such member."})
        if not self.user.is_active:
            raise ValidationError(
                {"user": f"{self.user.name} is deactivated. Pick an active member."}
            )
        if self.user.function != self.function:
            label = self.get_function_display()
            raise ValidationError(
                {
                    "user": f"{self.user.name} is in {self.user.get_function_display()}, "
                    f"not {label}. Pick someone from {label}."
                }
            )

    def save(self, *args, **kwargs):
        self.clean()
        return super().save(*args, **kwargs)
```

Run: `$PY manage.py makemigrations knowledge` → `services/knowledge/migrations/0006_functionhead.py` (one `CreateModel` with the constraint; depends on `knowledge.0005_gap_sweep_marker`, the latest `accounts` migration and the user model).

Create `services/knowledge/heads.py`:

```python
"""Department heads (Slack escalations D2, contract §1.1, SE2-2 to SE2-6).

A department is a function (`User.Function`, spec §14 Q1). Each function
may have one head per workspace: the person who takes a customer's
escalation in that function when nobody on the customer's account team
works in it (`ownership.handler_for`). Reading is for every member;
changing needs `manage_org_settings` (the view) and writes
`function_head.changed`."""

from django.db import transaction

from core import audit
from services.accounts.models import User

from .models import FunctionHead


def on_duty(user, function=None):
    """An active person and, when `function` is given, still working in
    it. Someone who left, or moved to another function, takes nothing
    (SE2-4)."""
    return user is not None and user.is_active and (function is None or user.function == function)


def head_for(organisation_id, function):
    """The function's head in the workspace when on duty, else None. One query."""
    if organisation_id is None:
        return None
    row = (
        FunctionHead.objects.filter(organisation_id=organisation_id, function=function)
        .select_related("user")
        .first()
    )
    return row.user if row is not None and on_duty(row.user, function) else None


def rows(organisation_id):
    """GET /function-heads/: one row per function, in `User.Function`
    order; a head off duty reads as nobody (SE2-4). One query."""
    named = {
        head.function: head.user
        for head in FunctionHead.objects.filter(organisation_id=organisation_id).select_related(
            "user"
        )
        if on_duty(head.user, head.function)
    }
    return [
        {
            "function": function,
            "function_display": label,
            "user": (
                {"id": named[function].id, "name": named[function].name}
                if function in named
                else None
            ),
        }
        for function, label in User.Function.choices
    ]


def change(organisation, function, user, *, request):
    """Make `user` (or nobody, with None) the function's head. Raises the
    model's ValidationError when `user` may not head it; then nothing
    changed. Audits only a real change (SE2-6)."""
    with transaction.atomic():
        current = (
            FunctionHead.objects.select_for_update()
            .filter(organisation=organisation, function=function)
            .first()
        )
        was = current.user_id if current is not None else None
        if user is None:
            if current is not None:
                current.delete()
        elif current is not None:
            current.user = user
            current.save()
        else:
            FunctionHead(organisation=organisation, function=function, user=user).save()
        now = user.id if user is not None else None
        if was != now:
            # SOC2:LOG-01 who changed which head, from whom to whom (ids only).
            audit.record(
                "function_head.changed",
                request=request,
                organisation=organisation,
                target=organisation,
                metadata={"function": function, "from": was, "to": now},
            )
```

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.knowledge.tests.test_function_heads --parallel auto --noinput && $PY manage.py makemigrations --check --dry-run`
Expected: PASS (10 tests); "No changes detected". If `test_rows_are_the_six_functions_in_order` counts more than 1 query, the extra one is in `rows` (read the SQL): fix it there.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/knowledge/models.py services/knowledge/migrations/0006_functionhead.py services/knowledge/heads.py services/knowledge/tests/heads_fixtures.py services/knowledge/tests/test_function_heads.py
git commit -m "feat(knowledge): department heads, one per function per workspace

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `GET/PATCH /function-heads/`

**Files:**
- Modify: `services/knowledge/serializers.py`, `services/knowledge/views.py`, `services/knowledge/urls.py`
- Create: `services/knowledge/tests/test_function_heads_views.py`

**Interfaces:**
- Consumes: `heads.rows`, `heads.change` (Task 1).
- Produces: `GET/PATCH /api/v1/function-heads/` (contract §2), `knowledge.views.FunctionHeadsView`, `serializers.FunctionHeadChangeSerializer`; the pin `FUNCTION_HEADS_QUERIES = 1`.

- [ ] **Step 1: Write the failing tests**

Create `services/knowledge/tests/test_function_heads_views.py`:

```python
"""Slack escalations D2 contract §2, SE2-5, SE2-6, SE2-8: any member reads
the heads; an organisation-settings manager names them; every refusal in
plain words; every real change audited."""

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.accounts.models import User
from services.knowledge.models import FunctionHead
from services.knowledge.tests.heads_fixtures import HeadsFixture

URL = "/api/v1/function-heads/"
FUNCTION_HEADS_QUERIES = 1


class FunctionHeadsViewTests(HeadsFixture):
    def heads_by_function(self, answer):
        return {row["function"]: row["user"] for row in answer.json()}

    def test_any_member_reads_the_six_functions(self):
        FunctionHead.objects.create(organisation=self.org, function="engineering", user=self.jesh)
        answer = self.as_(self.carl).get(URL)
        self.assertEqual(answer.status_code, 200)
        self.assertEqual(len(answer.json()), 6)
        self.assertEqual(
            answer.json()[1],
            {
                "function": "engineering",
                "function_display": "Engineering",
                "user": {"id": self.jesh.id, "name": "Jesh Sanghvi"},
            },
        )
        self.assertNotIn("email", str(answer.json()))

    def test_another_workspaces_heads_are_never_shown(self):
        FunctionHead.objects.create(
            organisation=self.elsewhere, function="engineering", user=self.zed
        )
        self.assertIsNone(self.heads_by_function(self.as_(self.alice).get(URL))["engineering"])

    def test_signed_out_is_refused(self):
        self.assertEqual(APIClient().get(URL).status_code, 401)
        self.assertEqual(
            APIClient().patch(URL, {"function": "cs", "user_id": None}, format="json").status_code,
            401,
        )

    def test_naming_a_head_needs_organisation_settings(self):
        answer = self.as_(self.carl).patch(
            URL, {"function": "engineering", "user_id": self.jesh.id}, format="json"
        )
        self.assertEqual(answer.status_code, 403)
        self.assertEqual(
            answer.json(), {"detail": "You don't have permission to change organisation settings."}
        )
        self.assertFalse(FunctionHead.objects.exists())
        self.assertFalse(AuditEvent.objects.filter(action="function_head.changed").exists())

    def test_an_admin_names_replaces_and_clears_a_head(self):
        api = self.as_(self.alice)
        named = api.patch(URL, {"function": "engineering", "user_id": self.jesh.id}, format="json")
        self.assertEqual(named.status_code, 200)
        self.assertEqual(
            self.heads_by_function(named)["engineering"],
            {"id": self.jesh.id, "name": "Jesh Sanghvi"},
        )
        replaced = api.patch(
            URL, {"function": "engineering", "user_id": self.erin.id}, format="json"
        )
        self.assertEqual(self.heads_by_function(replaced)["engineering"]["id"], self.erin.id)
        cleared = api.patch(URL, {"function": "engineering", "user_id": None}, format="json")
        self.assertIsNone(self.heads_by_function(cleared)["engineering"])
        events = list(AuditEvent.objects.filter(action="function_head.changed").order_by("id"))
        self.assertEqual(
            [e.metadata for e in events],
            [
                {"function": "engineering", "from": None, "to": self.jesh.id},
                {"function": "engineering", "from": self.jesh.id, "to": self.erin.id},
                {"function": "engineering", "from": self.erin.id, "to": None},
            ],
        )
        self.assertTrue(all(e.actor_id == self.alice.id for e in events))
        self.assertTrue(all(e.target_id == str(self.org.id) for e in events))

    def test_naming_the_same_head_again_writes_no_audit_row(self):
        api = self.as_(self.alice)
        for _ in range(2):
            api.patch(URL, {"function": "engineering", "user_id": self.jesh.id}, format="json")
        self.assertEqual(AuditEvent.objects.filter(action="function_head.changed").count(), 1)

    def test_refusals_in_plain_words(self):
        api = self.as_(self.alice)
        User.objects.filter(pk=self.erin.pk).update(is_active=False)
        cases = [
            ({"user_id": self.jesh.id}, {"function": ["This field is required."]}),
            (
                {"function": "finance", "user_id": self.jesh.id},
                {"function": ['"finance" is not a valid choice.']},
            ),
            ({"function": "engineering"}, {"user_id": ["This field is required."]}),
            ({"function": "engineering", "user_id": self.zed.id}, {"user_id": ["No such member."]}),
            ({"function": "engineering", "user_id": 999999}, {"user_id": ["No such member."]}),
            (
                {"function": "engineering", "user_id": self.erin.id},
                {"user_id": ["Erin Engineer is deactivated. Pick an active member."]},
            ),
            (
                {"function": "engineering", "user_id": self.faiz.id},
                {
                    "user_id": [
                        "Faiz Jamal is in Customer Success, not Engineering. "
                        "Pick someone from Engineering."
                    ]
                },
            ),
        ]
        for body, refusal in cases:
            with self.subTest(body=body):
                answer = api.patch(URL, body, format="json")
                self.assertEqual(answer.status_code, 400)
                self.assertEqual(answer.json(), refusal)
        self.assertFalse(FunctionHead.objects.exists())
        self.assertFalse(AuditEvent.objects.filter(action="function_head.changed").exists())

    def test_reading_is_one_query_whatever_the_heads(self):
        api = self.as_(self.carl)
        for user, function in ((None, None), (self.jesh, "engineering"), (self.faiz, "cs")):
            if user is not None:
                FunctionHead.objects.create(organisation=self.org, function=function, user=user)
            with CaptureQueriesContext(connection) as seen:
                self.assertEqual(api.get(URL).status_code, 200)
            self.assertEqual(len(seen), FUNCTION_HEADS_QUERIES, [q["sql"] for q in seen])
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.knowledge.tests.test_function_heads_views --parallel auto --noinput`
Expected: FAIL: every request answers 404 (no route).

- [ ] **Step 3: The serializer, the view and the route**

`services/knowledge/serializers.py`: add `from services.accounts.models import User` under `from rest_framework import serializers` (one blank line between the groups), and at the end of the file:

```python
class FunctionHeadChangeSerializer(serializers.Serializer):
    """PATCH /function-heads/ (Slack escalations D2, contract §2). Both
    keys are required: a missing `user_id` never clears a head."""

    function = serializers.ChoiceField(choices=User.Function.choices)
    user_id = serializers.IntegerField(allow_null=True)
```

`services/knowledge/views.py`:
- imports: `from django.core.exceptions import ValidationError` (above `from django.db import transaction`); `from services.accounts.permissions import CanManageOrgSettings, CanViewAllAccounts`; `from . import brief, heads, mentions`; and the serializers import becomes

```python
from .serializers import (
    ContributionSerializer,
    FunctionHeadChangeSerializer,
    KnowledgeGapSerializer,
    QuestionSerializer,
)
```

- after `class CustomerResponsibleView` (before `def responsible_for_q():`):

```python
class FunctionHeadsView(APIView):
    """GET/PATCH /api/v1/function-heads/ (Slack escalations D2, contract
    §2): the head of each function in the caller's workspace. Any member
    reads; PATCH `{"function": "engineering", "user_id": 7 | null}` needs
    `manage_org_settings` and answers the six rows again."""

    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.request.method == "PATCH":
            # SOC2:AUTH-02 only an organisation-settings manager names a head (SE2-5).
            return [CanManageOrgSettings()]
        return super().get_permissions()

    def get(self, request):
        return Response(heads.rows(request.user.organisation_id))

    def patch(self, request):
        given = FunctionHeadChangeSerializer(data=request.data)
        given.is_valid(raise_exception=True)
        organisation = request.user.organisation
        user_id = given.validated_data["user_id"]
        user = None
        if user_id is not None:
            # SOC2:AUTH-02 a member of the caller's own workspace only.
            user = User.objects.filter(organisation=organisation, pk=user_id).first()
            if user is None:
                return Response(
                    {"user_id": ["No such member."]}, status=status.HTTP_400_BAD_REQUEST
                )
        try:
            heads.change(organisation, given.validated_data["function"], user, request=request)
        except ValidationError as refused:
            return Response(
                {"user_id": refused.message_dict["user"]}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(heads.rows(organisation.id))
```

`services/knowledge/urls.py`: after the `questions/` route:

```python
(path("function-heads/", views.FunctionHeadsView.as_view(), name="function-heads"),)
```

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.knowledge --parallel auto --noinput`
Expected: PASS (the whole `knowledge` app: nothing else moved). `test_reading_is_one_query_whatever_the_heads` holds at 1; if it reads more, the failure message lists the SQL: an `accounts_organisation` read means `request.user.organisation` slipped into the GET (use `organisation_id`).

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/knowledge/serializers.py services/knowledge/views.py services/knowledge/urls.py services/knowledge/tests/test_function_heads_views.py
git commit -m "feat(knowledge): read and name department heads with an audit row

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Who handles a record in a function

**Files:**
- Modify: `services/knowledge/ownership.py` (append)
- Create: `services/knowledge/tests/test_handler_for.py`

**Interfaces:**
- Consumes: `heads.on_duty`, `heads.head_for` (Task 1); `knowledge.models.FunctionOwner` (existing).
- Produces: `ownership.handler_for(record, function, *, organisation_id=None) -> tuple[User | None, str]` with `via` in `{"team", "head", "nobody"}` (SE2-7). D3 calls it with the bundle's record, the function the model named, and `organisation_id=bundle.organisation_id`.

- [ ] **Step 1: Write the failing tests**

Create `services/knowledge/tests/test_handler_for.py`:

```python
"""Slack escalations D2 spec §4.3, SE2-4, SE2-7, SE2-8: the account team
first, then the department head, then nobody; people who left or moved are
skipped; an account takes its one parent's answer, otherwise its owner for
Customer Success and the head for the rest."""

from services.accounts.models import User
from services.knowledge.models import FunctionHead, FunctionOwner
from services.knowledge.ownership import handler_for
from services.knowledge.tests.heads_fixtures import HeadsFixture

#: A customer's team hit, and a fallback to the head (SE2-8); an account adds 1.
TEAM_QUERIES = 1
HEAD_QUERIES = 2
ACCOUNT_EXTRA_QUERIES = 1


class HandlerForCustomerTests(HeadsFixture):
    def setUp(self):
        super().setUp()
        FunctionHead.objects.create(organisation=self.org, function="engineering", user=self.jesh)
        FunctionHead.objects.create(organisation=self.org, function="cs", user=self.carl)

    def test_the_account_team_comes_first(self):
        FunctionOwner.objects.create(customer=self.globex, function="engineering", user=self.erin)
        globex = self.fresh(self.globex)
        with self.assertNumQueries(TEAM_QUERIES):
            self.assertEqual(handler_for(globex, "engineering"), (self.erin, "team"))

    def test_the_head_takes_it_when_nobody_on_the_team_does(self):
        globex = self.fresh(self.globex)
        with self.assertNumQueries(HEAD_QUERIES):
            self.assertEqual(handler_for(globex, "engineering"), (self.jesh, "head"))

    def test_nobody_when_there_is_no_head_either(self):
        globex = self.fresh(self.globex)
        with self.assertNumQueries(HEAD_QUERIES):
            self.assertEqual(handler_for(globex, "sales"), (None, "nobody"))

    def test_customer_success_is_the_owner_then_its_head(self):
        globex = self.fresh(self.globex)
        with self.assertNumQueries(TEAM_QUERIES):
            self.assertEqual(handler_for(globex, "cs"), (self.faiz, "team"))
        User.objects.filter(pk=self.faiz.pk).update(is_active=False)
        self.assertEqual(handler_for(self.fresh(self.globex), "cs"), (self.carl, "head"))
        self.globex.owner = None
        self.globex.save(update_fields=["owner"])
        self.assertEqual(handler_for(self.fresh(self.globex), "cs"), (self.carl, "head"))

    def test_the_owner_may_work_in_any_function(self):
        self.globex.owner = self.jesh  # an engineer owns the account
        self.globex.save(update_fields=["owner"])
        self.assertEqual(handler_for(self.fresh(self.globex), "cs"), (self.jesh, "team"))

    def test_people_who_left_are_skipped(self):
        FunctionOwner.objects.create(customer=self.globex, function="engineering", user=self.erin)
        User.objects.filter(pk=self.erin.pk).update(is_active=False)
        self.assertEqual(handler_for(self.fresh(self.globex), "engineering"), (self.jesh, "head"))
        User.objects.filter(pk=self.jesh.pk).update(is_active=False)
        self.assertEqual(handler_for(self.fresh(self.globex), "engineering"), (None, "nobody"))

    def test_people_who_moved_function_are_skipped(self):
        FunctionOwner.objects.create(customer=self.globex, function="engineering", user=self.erin)
        User.objects.filter(pk=self.erin.pk).update(function=User.Function.SALES)
        self.assertEqual(handler_for(self.fresh(self.globex), "engineering"), (self.jesh, "head"))
        User.objects.filter(pk=self.jesh.pk).update(function=User.Function.SALES)
        self.assertEqual(handler_for(self.fresh(self.globex), "engineering"), (None, "nobody"))

    def test_only_its_own_workspaces_head(self):
        FunctionHead.objects.filter(organisation=self.org, function="engineering").delete()
        FunctionHead.objects.create(
            organisation=self.elsewhere, function="engineering", user=self.zed
        )
        self.assertEqual(handler_for(self.fresh(self.globex), "engineering"), (None, "nobody"))

    def test_an_unknown_function_is_a_bug(self):
        with self.assertRaises(ValueError):
            handler_for(self.globex, "finance")


class HandlerForAccountTests(HeadsFixture):
    def setUp(self):
        super().setUp()
        FunctionHead.objects.create(organisation=self.org, function="engineering", user=self.jesh)
        FunctionHead.objects.create(organisation=self.org, function="cs", user=self.carl)
        FunctionOwner.objects.create(customer=self.globex, function="engineering", user=self.erin)

    def test_one_parent_gives_its_answer(self):
        emea = self.fresh(self.account("Globex EMEA", self.globex, owner=self.carl))
        with self.assertNumQueries(ACCOUNT_EXTRA_QUERIES + TEAM_QUERIES):
            self.assertEqual(handler_for(emea, "engineering"), (self.erin, "team"))
        # Customer Success is the parent's owner, as the spec says (owner question 1).
        self.assertEqual(handler_for(self.fresh(emea), "cs"), (self.faiz, "team"))
        self.assertEqual(handler_for(self.fresh(emea), "sales"), (None, "nobody"))

    def test_two_parents_use_the_account_owner_then_the_heads(self):
        joint = self.account("Joint venture", self.globex, self.initech, owner=self.faiz)
        fresh = self.fresh(joint)
        with self.assertNumQueries(ACCOUNT_EXTRA_QUERIES + TEAM_QUERIES):
            self.assertEqual(handler_for(fresh, "cs"), (self.faiz, "team"))
        fresh = self.fresh(joint)
        with self.assertNumQueries(ACCOUNT_EXTRA_QUERIES + 1):
            # Globex's engineer is not the joint account's: the head takes it.
            self.assertEqual(handler_for(fresh, "engineering"), (self.jesh, "head"))
        joint.owner = None
        joint.save(update_fields=["owner"])
        self.assertEqual(handler_for(self.fresh(joint), "cs"), (self.carl, "head"))

    def test_no_parent_needs_the_workspace_for_a_head(self):
        orphan = self.account("Orphan division", owner=self.faiz)
        self.assertEqual(handler_for(self.fresh(orphan), "cs"), (self.faiz, "team"))
        self.assertEqual(handler_for(self.fresh(orphan), "engineering"), (None, "nobody"))
        self.assertEqual(
            handler_for(self.fresh(orphan), "engineering", organisation_id=self.org.id),
            (self.jesh, "head"),
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.knowledge.tests.test_handler_for --parallel auto --noinput`
Expected: FAIL: `ImportError: cannot import name 'handler_for'`.

- [ ] **Step 3: `handler_for`**

Append to `services/knowledge/ownership.py`:

```python
def handler_for(record, function, *, organisation_id=None):
    """Who handles `record` (a Customer or an Account) in `function`
    (Slack escalations D2, spec §4.3, SE2-7). Returns `(user, via)`:

    1. the account team: for Customer Success the customer's owner (any
       function), for any other function its `FunctionOwner`, when on
       duty (`heads.on_duty`): `"team"`;
    2. else the function's head, when on duty: `"head"`;
    3. else `(None, "nobody")`.

    An account takes its parent customer's answer when it has exactly one
    parent customer; otherwise its own owner for Customer Success, and the
    function's head for every function (Customer Success too, when the
    owner is off duty or unset). `organisation_id` names the workspace
    whose head is used when the record cannot (an account with no parent);
    a caller that knows it passes it. Only that workspace's head is read."""
    from services.accounts.models import User
    from services.customers.models import Account

    from .heads import head_for, on_duty
    from .models import FunctionOwner

    if function not in User.Function.values:
        raise ValueError(f"Unknown function: {function!r}")
    if isinstance(record, Account):
        parents = list(record.customers.all()[:2])
        if len(parents) == 1:
            return handler_for(parents[0], function, organisation_id=organisation_id)
        if function == User.Function.CS and on_duty(record.owner):
            return record.owner, "team"
        if organisation_id is None and parents:
            organisation_id = parents[0].organisation_id
    else:
        organisation_id = organisation_id or record.organisation_id
        if function == User.Function.CS:
            if on_duty(record.owner):
                return record.owner, "team"
        else:
            owner = (
                FunctionOwner.objects.filter(customer=record, function=function)
                .select_related("user")
                .first()
            )
            if owner is not None and on_duty(owner.user, function):
                return owner.user, "team"
    head = head_for(organisation_id, function)
    return (head, "head") if head is not None else (None, "nobody")
```

Query count, so the pins read right: a customer's Customer Success hit reads `record.owner` (1); any other team hit reads the `FunctionOwner` with its user (1); a fallback adds `head_for` (1). An account adds the parents read (1); with two parents, its Customer Success hit reads `record.owner` (1) and an engineering fallback reads only the head (1), hence `ACCOUNT_EXTRA_QUERIES + 1` in the two-parent test.

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.knowledge --parallel auto --noinput`
Expected: PASS. `grep -rn "handler_for" services --include=*.py | grep -v "/tests/"` lists only `services/knowledge/ownership.py` (SE2-1: nothing calls it yet).

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/knowledge/ownership.py services/knowledge/tests/test_handler_for.py
git commit -m "feat(knowledge): handler_for, the account team then the department head

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Audit the account team

**Files:**
- Modify: `services/knowledge/views.py` (`CustomerResponsibleView.patch`)
- Create: `services/knowledge/tests/test_account_team_audit.py`

**Interfaces:**
- Produces: the `function_owner.changed` audit row (SE2-9, contract §5). No shape change.

- [ ] **Step 1: Write the failing tests**

Create `services/knowledge/tests/test_account_team_audit.py`:

```python
"""Slack escalations D2 SE2-9: a change to a customer's account team is
written down; a refused or empty change is not."""

from core.models import AuditEvent
from services.knowledge.tests.heads_fixtures import HeadsFixture


class AccountTeamAuditTests(HeadsFixture):
    def url(self, customer):
        return f"/api/v1/customers/{customer.id}/responsible/"

    def events(self):
        return list(
            AuditEvent.objects.filter(action="function_owner.changed")
            .order_by("id")
            .values_list("target_id", "metadata")
        )

    def test_set_replace_and_clear_are_each_one_row(self):
        api = self.as_(self.alice)
        url = self.url(self.globex)
        for user_id in (self.erin.id, self.erin.id, self.jesh.id, None, None):
            self.assertEqual(
                api.patch(
                    url, {"function": "engineering", "user_id": user_id}, format="json"
                ).status_code,
                200,
            )
        target = str(self.globex.id)
        self.assertEqual(
            self.events(),
            [
                (target, {"function": "engineering", "from": None, "to": self.erin.id}),
                (target, {"function": "engineering", "from": self.erin.id, "to": self.jesh.id}),
                (target, {"function": "engineering", "from": self.jesh.id, "to": None}),
            ],
        )

    def test_customer_success_is_the_owner(self):
        answer = self.as_(self.alice).patch(
            self.url(self.globex), {"function": "cs", "user_id": self.carl.id}, format="json"
        )
        self.assertEqual(answer.status_code, 200)
        self.assertEqual(
            self.events(),
            [(str(self.globex.id), {"function": "cs", "from": self.faiz.id, "to": self.carl.id})],
        )

    def test_refusals_write_nothing(self):
        # Carl has no view-all-accounts.
        self.assertEqual(
            self.as_(self.carl)
            .patch(
                self.url(self.globex),
                {"function": "engineering", "user_id": self.erin.id},
                format="json",
            )
            .status_code,
            403,
        )
        # Faiz works in Customer Success, not Engineering.
        self.assertEqual(
            self.as_(self.alice)
            .patch(
                self.url(self.globex),
                {"function": "engineering", "user_id": self.faiz.id},
                format="json",
            )
            .status_code,
            400,
        )
        self.assertEqual(self.events(), [])
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.knowledge.tests.test_account_team_audit --parallel auto --noinput`
Expected: FAIL: `test_set_replace_and_clear_are_each_one_row` and `test_customer_success_is_the_owner` find no rows (`[] != [...]`); `test_refusals_write_nothing` passes already.

- [ ] **Step 3: The audit call**

In `CustomerResponsibleView.patch` (`services/knowledge/views.py`), right after the `user = (... get_object_or_404(User, ...))` assignment, read who answers today:

```python
        was = (
            customer.owner_id
            if function == User.Function.CS
            else customer.function_owners.filter(function=function)
            .values_list("user_id", flat=True)
            .first()
        )
```

and replace the method's last line, `return Response(self._payload(customer))`, with:

```python
        now = user.id if user is not None else None
        if was != now:
            # SOC2:LOG-01 the account team changed (Slack escalations D2,
            # SE2-9): on which customer, which function, from whom to whom
            # (ids only).
            audit.record(
                "function_owner.changed",
                request=request,
                target=customer,
                metadata={"function": function, "from": was, "to": now},
            )
        return Response(self._payload(customer))
```

The two refusals inside the method (`PermissionDenied` from `may_change_owner`, and the 400 for a person outside the function) return before this point, so they write nothing.

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.knowledge --parallel auto --noinput`
Expected: PASS (the existing `test_views.py` and `test_ownership.py` responsible tests unchanged).

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/knowledge/views.py services/knowledge/tests/test_account_team_audit.py
git commit -m "feat(knowledge): audit changes to a customer's account team

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The journey

**Files:**
- Create: `e2e/test_account_team_flow.py`

**Interfaces:**
- Consumes: everything above, over real HTTP.

- [ ] **Step 1: Write the journey**

Create `e2e/test_account_team_flow.py`:

```python
"""End-to-end tier: real server, real HTTP, real test DB (Slack
escalations D2).

Alice runs the workspace. Faiz (Customer Success) owns Globex; Jesh and
Erin are engineers; Carl is a CSM. Carl reads the department heads but
cannot name one. Alice names Jesh Engineering head after a refusal for
Faiz; Globex's engineering escalation then goes to Jesh. Alice puts Erin
on Globex's account team: it goes to Erin; Erin is deactivated: back to
Jesh; Alice clears the head: nobody. Every change is in the audit log."""

from django.test import LiveServerTestCase

from core.models import AuditEvent
from e2e.http import http_get, http_patch, http_post
from services.accounts.models import User
from services.billing.models import BillingAccount
from services.customers.models import Customer
from services.knowledge.ownership import handler_for


class AccountTeamFlowTests(LiveServerTestCase):
    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def login(self, email, password="memberpass12"):
        status, body = http_post(self.api("/auth/login/"), {"email": email, "password": password})
        self.assertEqual(status, 200, body)
        return body["access"]

    def member(self, admin, name, email, function):
        status, body = http_post(
            self.api("/auth/users/"),
            {"name": name, "email": email, "password": "memberpass12", "function": function},
            token=admin,
        )
        self.assertEqual(status, 201, body)
        return User.objects.get(pk=body["id"])

    def handler(self, customer, function):
        return handler_for(Customer.objects.get(pk=customer.pk), function)

    def test_full_flow(self):
        status, body = http_post(
            self.api("/auth/signup/"),
            {
                "organisation_name": "Alfiee QA",
                "name": "Alice Admin",
                "email": "alice@alfiee.example",
                "password": "supersecret1",
            },
        )
        self.assertEqual(status, 201, body)
        alice = body["access"]
        BillingAccount.objects.filter(organisation__name="Alfiee QA").update(seats_limit=10)
        faiz = self.member(alice, "Faiz Jamal", "faiz@alfiee.example", "cs")
        jesh = self.member(alice, "Jesh Sanghvi", "jesh@alfiee.example", "engineering")
        erin = self.member(alice, "Erin Engineer", "erin@alfiee.example", "engineering")
        self.member(alice, "Carl CSM", "carl@alfiee.example", "cs")
        globex = Customer.objects.create(
            organisation=faiz.organisation, name="Globex (QA)", owner=faiz
        )
        carl = self.login("carl@alfiee.example")
        heads_url = self.api("/function-heads/")

        # 1. Carl reads the six functions, nobody heads any; he cannot name one.
        status, rows = http_get(heads_url, token=carl)
        self.assertEqual(status, 200)
        self.assertEqual([r["user"] for r in rows], [None] * 6)
        status, body = http_patch(
            heads_url, {"function": "engineering", "user_id": jesh.id}, token=carl
        )
        self.assertEqual(status, 403, body)

        # 2. Alice tries Faiz for Engineering: refused in plain words; then Jesh.
        status, body = http_patch(
            heads_url, {"function": "engineering", "user_id": faiz.id}, token=alice
        )
        self.assertEqual(status, 400)
        self.assertEqual(
            body,
            {
                "user_id": [
                    "Faiz Jamal is in Customer Success, not Engineering. Pick someone from Engineering."
                ]
            },
        )
        status, rows = http_patch(
            heads_url, {"function": "engineering", "user_id": jesh.id}, token=alice
        )
        self.assertEqual(status, 200, rows)
        status, rows = http_get(heads_url, token=carl)
        self.assertEqual(rows[1]["user"], {"id": jesh.id, "name": "Jesh Sanghvi"})
        self.assertEqual(self.handler(globex, "engineering"), (jesh, "head"))
        self.assertEqual(self.handler(globex, "cs"), (faiz, "team"))

        # 3. Erin joins Globex's account team: the escalation is hers.
        status, body = http_patch(
            self.api(f"/customers/{globex.id}/responsible/"),
            {"function": "engineering", "user_id": erin.id},
            token=alice,
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(self.handler(globex, "engineering"), (erin, "team"))

        # 4. Erin leaves: the head takes it again. The head is cleared: nobody.
        status, body = http_patch(
            self.api(f"/auth/users/{erin.id}/"), {"is_active": False}, token=alice
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(self.handler(globex, "engineering"), (jesh, "head"))
        status, rows = http_patch(
            heads_url, {"function": "engineering", "user_id": None}, token=alice
        )
        self.assertEqual(status, 200, rows)
        self.assertIsNone(rows[1]["user"])
        self.assertEqual(self.handler(globex, "engineering"), (None, "nobody"))

        # 5. Written down: two head changes, one account-team change, ids only.
        self.assertEqual(
            list(
                AuditEvent.objects.filter(action="function_head.changed")
                .order_by("id")
                .values_list("metadata", flat=True)
            ),
            [
                {"function": "engineering", "from": None, "to": jesh.id},
                {"function": "engineering", "from": jesh.id, "to": None},
            ],
        )
        self.assertEqual(
            AuditEvent.objects.get(action="function_owner.changed").metadata,
            {"function": "engineering", "from": None, "to": erin.id},
        )
```

- [ ] **Step 2: Run it**

Run: `$PY manage.py test e2e.test_account_team_flow --parallel 1 --noinput`
Expected: PASS. (If the users endpoint's body keys differ, read `e2e/test_work_flow.py` and `e2e/test_auth_flow.py`, which create and deactivate members the same way, and match them; do not change the assertions about heads.)

- [ ] **Step 3: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add e2e/test_account_team_flow.py
git commit -m "test(e2e): department heads and the account team decide who handles a customer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Docs and the full check

**Files:**
- Modify: `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/data-classification.md`, `.soc2/CONTROL_MAP.md`, `docs/product/01-prd.md`, `docs/product/02-trd.md`, `docs/product/05-backend-schema.md`, `docs/product/06-implementation-plan.md`, this delivery's contract ("Changes during the build").

- [ ] **Step 1: The docs**

Follow the `api-contracts` skill.

- `docs/API_CONTRACTS.md`:
  - in `## knowledge — What the whole company knows`, under `### GET/PATCH /api/v1/customers/<id>/responsible/`, add: "A PATCH that changes who answers for a function writes `function_owner.changed` (target the customer, `function`, `from`, `to`, user ids; nothing on a refusal or when the person is the same). Slack escalations D2."
  - after the section `### Slack escalations, delivery 1: Slack as a conversation (2026-10-15)` and its subsections, a new `### Slack escalations, delivery 2: Account team and department heads (2026-10-15)`: "Folded in from the delivery's contract (`docs/superpowers/plans/2026-10-15-slack-escalations-d2-api.md`, with its Changes during the build; the as-built behaviour wins)", then `#### Data` (`knowledge.FunctionHead`, contract §1.1), `#### GET/PATCH /api/v1/function-heads/` (contract §2 verbatim: the six-row example and the refusal table), `#### Who handles a record in a function` (SE2-4 and SE2-7 in prose), `#### Audit` (both rows), `#### Query ceilings` (`FUNCTION_HEADS_QUERIES` 1; `handler_for` team 1, head 2, account +1, as measured).
- `docs/audit-events.md`, two rows in the table:
  - `| \`function_head.changed\` | \`services.knowledge.heads.change\` (from \`FunctionHeadsView.patch\`) | user (\`manage_org_settings\`) | Organisation | \`function\`, \`from\`, \`to\` (user ids or null); written only when the head changes |`
  - `| \`function_owner.changed\` | \`services.knowledge.views.CustomerResponsibleView.patch\` | user (\`view_all_accounts\`) | Customer | \`function\`, \`from\`, \`to\` (user ids or null; Customer Success is the owner); written only when the person changes |`
- `docs/data-classification.md`: the `knowledge` row's models gain `knowledge.FunctionHead` with a note "(ids only: who heads a function; internal)"; if the table keys rows by class, add its own row `| \`knowledge.FunctionHead\` | internal | organisation, function, user | who heads a department; no text |`.
- `.soc2/CONTROL_MAP.md`: AUTH-02's evidence gains "department heads are named only by `manage_org_settings` (`services/knowledge/views.py:FunctionHeadsView`), and a head is a member of the caller's own workspace"; LOG-01's gains "`function_head.changed` and `function_owner.changed` (`services/knowledge/heads.py`, `CustomerResponsibleView`)". Update the row dates to the day of the change.
- `docs/product/01-prd.md`: department heads (one per function, named in Settings › People & teams), the account team (one person per function per customer, Customer Success the owner), and who handles a customer's escalation (team, else head, else nobody), for D3.
- `docs/product/02-trd.md`: `services/knowledge/heads.py` and `ownership.handler_for` (SE2-4, SE2-7), the route and its rights.
- `docs/product/05-backend-schema.md`: under `## 8. knowledge`, a `FunctionHead` row: "The head of one function in a workspace. One per workspace and function. `clean()` requires an active member of the workspace working in that function; read as nobody once they leave or move."
- `docs/product/06-implementation-plan.md`: the D2 row (this PR, backend; frontend to follow).
- The contract's "Changes during the build": every deviation from this plan and the measured ceilings; send the same list to the frontend controller.

- [ ] **Step 2: The full check**

```bash
$PY manage.py test --parallel auto --noinput
$PY manage.py makemigrations --check --dry-run
$PY manage.py spectacular --file /tmp/schema.yml --validate
venv/bin/ruff check . && venv/bin/ruff format --check .
grep -rn "distinct" services/knowledge/heads.py services/knowledge/ownership.py || echo "no DISTINCT"
```

Expected: every test passes (write the count into the hand-off), no migration missing, schema valid, ruff clean, "no DISTINCT".

- [ ] **Step 3: Commit and push**

```bash
git add docs/API_CONTRACTS.md docs/audit-events.md docs/data-classification.md .soc2/CONTROL_MAP.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md docs/product/06-implementation-plan.md docs/superpowers/plans/2026-10-15-slack-escalations-d2-api.md
git commit -m "docs: department heads and the account team (Slack escalations D2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push origin feat/slack-escalations-d2
```

Hand-off (to the controller, not a PR): the head, the test count, the measured ceilings, "Changes during the build", and the owner's set-up and live checks (contract §8).

---

## Self-review

1. **Spec coverage (§4, §9 D2 row).** §4.1 functions as departments: SE2-1 (no code). §4.2 `FunctionHead` (organisation, function unique, user, `updated_at`; the head works in the function and is active): Task 1. The API (any member reads; PATCH `manage_org_settings`) and the audit row `function_head.changed` (who, function, from, to; ids only): Task 2. §4.3 `handler_for` (team; Customer Success the owner; head; nobody; inactive skipped; the account rule): Task 3. §4.4 the screens: the frontend plan; the backend serves them unchanged (`/responsible/`) or new (`/function-heads/`). §9 D2 tests: head must work in the function (Task 1, Task 2 refusals), `handler_for` order with team, head, nobody, inactive skipped, account rule (Task 3), rights on PATCH (Task 2, Task 5), audit row (Tasks 1, 2, 4, 5). The `/responsible/` audit (SE2-9) is beyond the spec's letter and recorded as a decision.
2. **Placeholders.** Every code step holds its code; the only reads left to the implementer are the existing e2e helpers' request shapes (named files to compare against).
3. **Type consistency.** `heads.rows(organisation_id)` (Task 1) is what the view's GET and PATCH answer (Task 2); `heads.change(organisation, function, user, *, request)` raises the `ValidationError` keyed `user` that the view maps to `user_id`; `heads.on_duty` / `head_for(organisation_id, function)` are what `handler_for` (Task 3) imports; `HeadsFixture` names (`alice`, `faiz`, `carl`, `jesh`, `erin`, `zed`, `org`, `elsewhere`, `globex`, `initech`, `as_`, `fresh`, `account`) are the same in every test file.
