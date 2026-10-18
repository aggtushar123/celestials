# Work in one place, delivery 2 (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Work › Team's "Waiting on your team" queue (`GET /work/feed/team/`), the three retired recommendation kinds (no longer produced, closed by a data migration, their settings and the cross-settlement gone), notification links into Work, and the removal of `/brain/waiting/*` and `/work/today/`.

**Architecture:** The queue is the feed's shape over the same sources at a wider scope. `team_scope.py` resolves the scope (team or company, Brain's rule) and names the scope's people other than the reader. Three small source modules subclass delivery 1's sources: `feed_team_decide` (Brain's desk at the scope, minus the reader's own Me desk), `feed_team_tasks` (overdue tasks with a record, read-only rows) and `feed_team_suggest` (recommendations the reader may decide, recipient in scope). `feed_team.py` orchestrates them with delivery 1's per-source savepoints and keyset cursors. The retirement removes producers, the settings switches and every Recommendation ↔ AgentAction settlement path; a data migration closes the open rows.

**Tech Stack:** Python 3.13, Django 5.2, DRF 3.18, Postgres 16 (CI/prod; local may be 15). Tests: `django.test`, `rest_framework.test`, `LiveServerTestCase` + `e2e/http.py`.

**Spec:** react-ts-app `docs/superpowers/specs/2026-10-12-work-one-place-design.md` (§4.3, §4.4, §4.5; delivery 2 of §8). **Binding contract:** `docs/superpowers/plans/2026-10-12-work-one-place-d2-api.md` (this repo), on top of delivery 1's `docs/superpowers/plans/2026-10-12-work-one-place-api.md`. Read both, and the D2 contract's "Decisions narrowing the spec" table, before any task.

## Global Constraints

- Work only in `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-two-be` on branch `feat/work-one-place-d2` (stacked on `feat/work-one-place`, PR #111). Never merge, never open a PR, never touch the servers on ports 8000, 8001 or 5174.
- Run tests as `venv/bin/python manage.py test <labels> --parallel auto --noinput` (the worktree's own venv; if absent, `../gmail-be/venv/bin/python`). Never the whole suite serially.
- Lint before each commit: `venv/bin/ruff check . && venv/bin/ruff format --check .` (`ruff format` also formats Markdown code blocks it understands; run `venv/bin/ruff format .` if the check fails, including on this plan file).
- Every commit message is a conventional commit and ends with exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Stage explicit paths (`git add <paths>`, `git rm` for deletions).
- Postgres 16: no visibility rule may be a join made unique with `DISTINCT`; use `id IN (subquery)`. Query counts are pinned in tests.
- Every visibility filter carries a `# SOC2:AUTH-02 ...` comment in the house style; audited writes keep `# SOC2:LOG-01`.
- Twice-filter: every AI-made row (agent actions, recommendations) is filtered on the way in by its source's own rule and on the way out by the reader's record rule before anything is named or an action offered (contract §1.6).
- Privacy: a to-do (task with no record) never reaches the Team queue, not even as `hidden`; a reply draft never does either.
- User-facing sentences are exactly the contract's. New ones: `"Choose team or company."`, `"Choose decide, overdue or suggested."`. Reused: `"You can't see that view."`, `"Say which group to page."`, `"That list has changed. Reload Work."`, `"Unknown source."`, `"Choose already handled, not relevant, wrong person or other."`.
- No new dependency. The dev database already has `customers.0061_task_todo`; this delivery adds `work.0006_retire_recommendation_kinds` and `notifications.0013_agent_proposal_waiting` (choices only, Task 13) only.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `services/work/team_scope.py` | create | `resolve_team`, `TeamScopeUnknown`, `people`, `named` |
| `services/work/feed_team_decide.py` | create | `TeamReviews`, `TeamApprovals`, `TeamQuestions`, `MAKERS` |
| `services/work/feed_team_tasks.py` | create | `TeamOverdue` |
| `services/work/feed_team_suggest.py` | create | `TeamSuggestions` |
| `services/work/feed_team.py` | create | `build`, `page`, `TEAM_GROUPS`, `CHOOSE_TEAM_GROUP` |
| `services/work/feed.py` | modify | `_attempt` → `attempt`, `_ordered` → `ordered` (shared with the queue) |
| `services/customers/task_access.py` | modify | `on_record_q()`; `is_todo` docstring |
| `services/customers/personal.py`, `services/work/team.py`, `services/brain/desk.py`, `services/work/feed_tasks.py` | modify | use `on_record_q()` |
| `services/work/views.py`, `services/work/urls.py` | modify | `TeamQueueView` at `feed/team/`; `TodayView` gone; `USE_APPLY` gone |
| `services/work/today.py` | delete | Work › Today's builder |
| `services/brain/views.py`, `services/brain/urls.py`, `services/brain/waiting.py` | modify | Waiting routes and `count` gone; `build` kept for Ask grounding |
| `services/customers/task_changes.py`, `services/work/digest.py`, `services/work/recommend.py`, `services/rules/nightly.py` | modify | links into Work |
| `services/work/models.py`, `services/work/migrations/0006_retire_recommendation_kinds.py` | modify/create | `DismissReason.RETIRED`, `RETIRED_KINDS`, `LIVE_KINDS`, `DEFAULT_SOURCES` without the retired switches; the data migration |
| `services/work/sources.py`, `services/work/routing.py`, `services/work/defaults.py`, `services/work/prefs.py` | modify | retired producers, routes and defaults gone |
| `services/work/deciding.py`, `services/agents/deciding.py`, `services/agents/views.py` | modify | the cross-settlement and the agents' refresh gone |
| tests | create/modify/delete | listed per task |
| `services/work/proposal_notice.py`, `services/notifications/models.py`, `services/notifications/migrations/0013_agent_proposal_waiting.py` | create/modify | the once-a-day AI proposal notice (Task 13) |
| `e2e/test_work_one_place_team_flow.py` | create | the journey |
| docs | modify | Task 12 |

---

### Task 1: The queue's scope and its people

**Files:**
- Create: `services/work/team_scope.py`
- Create: `services/work/tests/test_team_scope.py`
- Modify: `services/work/tests/feed_fixtures.py` (add `TEAM` and two helpers)

**Interfaces:**
- Consumes: `services.brain.scope.available`, `resolve`, `ScopeUnknown`, `ScopeNotAllowed`, `TEAM`, `COMPANY`.
- Produces: `TEAM_SCOPES = ("team", "company")`; `class TeamScopeUnknown(ScopeUnknown)` with `detail = "Choose team or company."`; `resolve_team(reader, key: str | None) -> Scope` (raises `TeamScopeUnknown` / `ScopeNotAllowed`); `people(reader, scope) -> QuerySet[{"id"}]` (the scope's members other than the reader, as a `values("id")` subquery); `named(user) -> {"id", "name"} | None`. Fixture: `TEAM = "/api/v1/work/feed/team/"`, `FeedFixture.queue(user, **params) -> Response`, `FeedFixture.queue_body(user, **params) -> dict` (asserts 200).

- [ ] **Step 1: Write the failing tests**

Append to `services/work/tests/feed_fixtures.py` (module constants next to `FEED`, methods inside `FeedFixture` after `body`):

```python
TEAM = "/api/v1/work/feed/team/"
```

```python
def queue(self, user, **params):
    return self.as_user(User.objects.get(pk=user.pk)).get(TEAM, params)


def queue_body(self, user, **params):
    response = self.queue(user, **params)
    self.assertEqual(response.status_code, 200, getattr(response, "data", None))
    return response.json()
```

Create `services/work/tests/test_team_scope.py`:

```python
"""The Team queue's scope (delivery 2 contract §1.1): team needs reports,
company needs view-all or Leadership, the default is the widest, and `me`
is refused. Its people are the scope's members other than the reader."""

from services.accounts.models import User
from services.brain.scope import ScopeNotAllowed
from services.work.team_scope import TeamScopeUnknown, named, people, resolve_team
from services.work.tests.feed_fixtures import FeedFixture


class TeamScopeTests(FeedFixture):
    def fresh(self, user):
        return User.objects.get(pk=user.pk)

    def test_the_default_is_the_widest_team_scope(self):
        self.assertEqual(resolve_team(self.fresh(self.mona), None).key, "team")
        self.assertEqual(resolve_team(self.fresh(self.admin), None).key, "company")
        self.assertEqual(resolve_team(self.fresh(self.lee), None).key, "company")

    def test_a_reader_with_neither_is_refused(self):
        for reader in (self.csm, self.other):
            with self.subTest(reader=reader.name), self.assertRaises(ScopeNotAllowed):
                resolve_team(self.fresh(reader), None)

    def test_me_and_unknown_keys_are_not_team_scopes(self):
        for key in ("me", "", "everyone"):
            with self.subTest(key=key), self.assertRaises(TeamScopeUnknown) as caught:
                resolve_team(self.fresh(self.mona), key)
            self.assertEqual(caught.exception.detail, "Choose team or company.")
            self.assertEqual(caught.exception.code, "SCOPE_UNKNOWN")

    def test_a_scope_the_reader_may_not_use_is_refused(self):
        with self.assertRaises(ScopeNotAllowed):
            resolve_team(self.fresh(self.mona), "company")
        with self.assertRaises(ScopeNotAllowed):
            resolve_team(self.fresh(self.admin), "team")

    def test_people_are_the_scopes_members_but_the_reader(self):
        mona = self.fresh(self.mona)
        self.assertEqual(
            sorted(row["id"] for row in people(mona, resolve_team(mona, "team"))), [self.csm.pk]
        )
        admin = self.fresh(self.admin)
        company = sorted(row["id"] for row in people(admin, resolve_team(admin, "company")))
        self.assertNotIn(self.admin.pk, company)
        self.assertNotIn(self.stranger.pk, company)
        self.assertEqual(company, sorted([self.lee.pk, self.mona.pk, self.csm.pk, self.other.pk]))

    def test_named(self):
        self.assertEqual(named(self.csm), {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertIsNone(named(None))
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.work.tests.test_team_scope --parallel auto --noinput`
Expected: FAIL with `ModuleNotFoundError: No module named 'services.work.team_scope'`.

- [ ] **Step 3: Write `services/work/team_scope.py`**

```python
"""The Team queue's scope (Work in one place, delivery 2 contract §1.1):
My team or Company, by Brain's rule (`brain.scope.available`): My team
needs reports, Company needs view_all_accounts or Leadership. Me is not a
Team scope: the reader's own desk is My work (Decision D2).

`people` is the scope's members other than the reader: everything already
on the reader's own My work stays off the queue (Decision D1)."""

from services.accounts.models import User
from services.brain.scope import COMPANY, TEAM, ScopeNotAllowed, ScopeUnknown, available, resolve

TEAM_SCOPES = (TEAM, COMPANY)


class TeamScopeUnknown(ScopeUnknown):
    detail = "Choose team or company."


def resolve_team(reader, key):
    """The reader's Team scope for `key` (None: the widest they have)."""
    # SOC2:AUTH-02 a scope the reader may not use is refused before anything is read
    if key is None:
        offered = [scope for scope in available(reader) if scope in TEAM_SCOPES]
        if not offered:
            raise ScopeNotAllowed(key)
        key = offered[-1]
    if key not in TEAM_SCOPES:
        raise TeamScopeUnknown(key)
    return resolve(reader, key)


def people(reader, scope):
    """The scope's members other than the reader, as an `id IN` subquery."""
    rows = User.objects.filter(organisation_id=reader.organisation_id).exclude(pk=reader.pk)
    if not scope.is_company:
        rows = rows.filter(id__in=sorted(scope.owner_ids))
    return rows.values("id")


def named(user):
    """`{"id", "name"}`, or None for nobody (the row's `for`)."""
    return None if user is None else {"id": user.pk, "name": user.name}
```

- [ ] **Step 4: Run them to see them pass**

Run: `venv/bin/python manage.py test services.work.tests.test_team_scope --parallel auto --noinput`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/work/team_scope.py services/work/tests/test_team_scope.py services/work/tests/feed_fixtures.py
git commit -m "feat(work): resolve the Team queue's scope and its people

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The queue's decide sources

**Files:**
- Create: `services/work/feed_team_decide.py`
- Create: `services/work/tests/test_feed_team_decide.py`

**Interfaces:**
- Consumes: `feed_decide.RuleReviews`, `Approvals`, `Questions` (their `count`, `hidden`, `page(after, limit)`, `items(objects)`, `rank`, `related`); `brain.desk.rule_reviews`, `agent_actions`, `questions`, `session_ids_seen_whole`; `team_scope.named`.
- Produces: `TeamReviews(reader, scope)`, `TeamApprovals(reader, scope)`, `TeamQuestions(reader, scope)`, each with `.count()`, `.hidden()`, `.page(after, limit) -> [((created_at, rank, id), TeamItem)]`; `MAKERS = {"rule_review": TeamReviews, "approval": TeamApprovals, "question": TeamQuestions}`. Every item is delivery 1's FeedItem plus `"for"`.

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_feed_team_decide.py`:

```python
"""The Team queue's decide sources (delivery 2 contract §1.4): Brain's desk
at the scope, minus the reader's own Me desk, each row naming who it waits
on. Rule reviews are read-only here; approvals offer exactly what
may_decide allows; questions offer Answer only with manage_users."""

from services.accounts.models import User
from services.rules.models import Rule
from services.work.feed_team_decide import MAKERS, TeamApprovals, TeamQuestions, TeamReviews
from services.work.team_scope import resolve_team
from services.work.tests.feed_fixtures import FeedFixture


class TeamDecideTests(FeedFixture):
    def team(self, user, key="team"):
        reader = User.objects.get(pk=user.pk)
        return reader, resolve_team(reader, key)

    def items(self, source):
        return [entry for _key, entry in source.page(None, 51)]

    def test_a_reports_approval_is_listed_for_its_owner_and_decidable_by_the_manager(self):
        action = self.proposal(self.pizza)
        self.proposal(self.soup)  # Mona's own: on her My work, not here
        source = TeamApprovals(*self.team(self.mona))
        (item,) = self.items(source)
        self.assertEqual(item["key"], f"agent_action:{action.pk}")
        self.assertEqual(item["for"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(item["actions"], ["approve", "reject"])
        self.assertEqual((source.count(), source.hidden()), (1, 0))

    def test_a_workspace_level_action_is_for_the_whole_company_and_view_all_only(self):
        from services.agents.tests.builder_fixtures import builder_action, definition

        action = builder_action(self.org, "segment.create", definition())
        admin = TeamApprovals(*self.team(self.admin, "company"))
        (item,) = self.items(admin)
        self.assertEqual((item["id"], item["for"], item["record"]), (action.pk, None, None))
        lee = TeamApprovals(*self.team(self.lee, "company"))
        self.assertEqual((lee.count(), lee.hidden()), (0, 0))

    def test_a_shared_rules_review_is_read_only_and_a_private_ones_is_hidden(self):
        shared = self.review(self.csm, name="Shared", sharing=Rule.Sharing.WORKSPACE)
        self.review(self.csm, name="Private")
        self.review(self.mona, name="Mine", sharing=Rule.Sharing.WORKSPACE)
        source = TeamReviews(*self.team(self.mona))
        (item,) = self.items(source)
        self.assertEqual(item["id"], shared.pk)
        self.assertEqual((item["actions"], item["detail"]["review"]), ([], None))
        self.assertEqual(item["for"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual((source.count(), source.hidden()), (1, 1))

    def test_a_reports_question_names_its_assignee_and_answer_needs_manage_users(self):
        asked = self.question(self.csm, customer=self.pizza)
        self.question(self.mona, customer=self.soup)  # Mona's own
        (item,) = self.items(TeamQuestions(*self.team(self.mona)))
        self.assertEqual((item["id"], item["actions"]), (asked.pk, []))
        self.assertEqual(item["for"], {"id": self.csm.pk, "name": "Carl CSM"})
        admin = self.items(TeamQuestions(*self.team(self.admin, "company")))
        self.assertEqual(next(i for i in admin if i["id"] == asked.pk)["actions"], ["answer"])

    def test_the_three_merge_by_rank_on_equal_times(self):
        from django.utils import timezone

        review = self.review(self.csm, sharing=Rule.Sharing.WORKSPACE)
        action = self.proposal(self.pizza)
        asked = self.question(self.csm, customer=self.pizza)
        stamp = timezone.now()
        for row in (review, action, asked):
            type(row).objects.filter(pk=row.pk).update(created_at=stamp)
        reader, scope = self.team(self.mona)
        rows = [
            row
            for kind in ("question", "approval", "rule_review")
            for row in MAKERS[kind](reader, scope).page(None, 51)
        ]
        rows.sort(key=lambda row: row[0])
        self.assertEqual(
            [entry["key"] for _key, entry in rows],
            [f"rule_review:{review.pk}", f"agent_action:{action.pk}", f"question:{asked.pk}"],
        )

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_team_decide --parallel auto --noinput`
Expected: FAIL with `ModuleNotFoundError: No module named 'services.work.feed_team_decide'`.

- [ ] **Step 3: Write `services/work/feed_team_decide.py`**

```python
"""The Team queue's decide group (Work in one place, delivery 2 contract
§1.4): agent actions, rule reviews and questions waiting on the scope's
people. Brain's desk sources at the scope, reused unchanged, minus what
waits on the reader's own Me desk, which My work already shows (Decision
D1). Each row says who it waits on (`for`).

What a row offers is delivery 1's rule, unchanged: an agent action exactly
when `may_decide` allows it; a rule review only to its rule's owner (never
the reader here, so always read-only); a question to its assignee or a
`manage_users` reader."""

from services.brain import desk
from services.brain.scope import ME, resolve

from . import feed_decide
from .feed_shape import APPROVAL, QUESTION, RULE_REVIEW
from .team_scope import named


def _with_for(objects, rows, owner_of):
    return [{**row, "for": named(owner_of(obj))} for obj, row in zip(objects, rows, strict=True)]


class TeamReviews(feed_decide.RuleReviews):
    def __init__(self, reader, scope):
        self.reader = reader
        found = desk.rule_reviews(reader, scope)
        # The reader's own rules' reviews wait on their My work (Decision D1).
        self.waiting = found.waiting.exclude(rule__owner_id=reader.pk)
        self.readable = found.readable.exclude(rule__owner_id=reader.pk)

    def items(self, reviews):
        return _with_for(reviews, super().items(reviews), lambda review: review.rule.owner)


def _owner(action):
    record = action.record
    return None if record is None else record.owner


class TeamApprovals(feed_decide.Approvals):
    def __init__(self, reader, scope):
        self.reader = reader
        self.sessions = desk.session_ids_seen_whole(reader)
        found = desk.agent_actions(reader, scope, self.sessions)
        mine = desk.agent_actions(reader, resolve(reader, ME), self.sessions).waiting
        # Decision D1: what is on the reader's own Me desk stays on My work.
        self.waiting = found.waiting.exclude(id__in=mine.values("id"))
        # SOC2:AUTH-02 the desk's readable rule (the record the reader may open), unchanged
        self.readable = found.readable.exclude(id__in=mine.values("id"))

    def items(self, actions):
        return _with_for(actions, super().items(actions), _owner)


class TeamQuestions(feed_decide.Questions):
    def __init__(self, reader, scope):
        self.reader = reader
        found = desk.questions(reader, scope)
        # Questions asked of the reader are on their My work (Decision D1).
        self.waiting = found.waiting.exclude(assignee_id=reader.pk)
        self.readable = found.readable.exclude(assignee_id=reader.pk)

    def items(self, questions):
        return _with_for(questions, super().items(questions), lambda q: q.assignee)


MAKERS = {RULE_REVIEW: TeamReviews, APPROVAL: TeamApprovals, QUESTION: TeamQuestions}
```

- [ ] **Step 4: Run them to see them pass**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_team_decide services.work.tests.test_feed_decide --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/work/feed_team_decide.py services/work/tests/test_feed_team_decide.py
git commit -m "feat(work): the Team queue's approvals, rule reviews and questions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The queue's overdue tasks, and one "has a record" rule

**Files:**
- Modify: `services/customers/task_access.py` (add `on_record_q`; docstring on `is_todo`)
- Modify: `services/customers/personal.py:36`, `services/work/team.py` (`build`), `services/brain/desk.py` (`overdue_tasks`), `services/work/feed_tasks.py` (`Tasks.__init__`)
- Create: `services/work/feed_team_tasks.py`
- Create: `services/work/tests/test_feed_team_tasks.py`
- Modify: `services/customers/tests/test_todo_privacy.py` (one test for `on_record_q`)

**Interfaces:**
- Consumes: `task_access.openable_tasks`, `feed_tasks.ORDER`, `PRIORITY_RANK`, `NO_DATE`, `task_item`; `states.open_tasks`, `overdue_q`; `team_scope.people`, `named`.
- Produces: `task_access.on_record_q() -> Q` (tasks with a record); `TeamOverdue(reader, scope, today)` with `.count()`, `.hidden()`, `.page(after, limit) -> [((due_key, prio, created_at, id), TeamItem)]`, every item `kind: "task"`, `actions: ["open"]`, `for` the assignee.

This task also closes delivery 1's deferred minor "the has-a-record Q is written out four times".

- [ ] **Step 1: Write the failing tests**

Append to `services/customers/tests/test_todo_privacy.py` (inside its test class, next to `test_is_todo_and_todo_q`; add `on_record_q` to the existing `task_access` import):

```python
    def test_on_record_q_is_every_task_but_a_to_do(self):
        on_record = set(Task.objects.filter(on_record_q()).values_list("pk", flat=True))
        self.assertNotIn(self.todo.pk, on_record)
        self.assertIn(self.overdue.pk, on_record)
```

Create `services/work/tests/test_feed_team_tasks.py`:

```python
"""The Team queue's overdue group (delivery 2 contract §1.4): open tasks
with a record, past due and not Blocked, assigned to the scope's people
other than the reader, that the reader may read. Read-only (Decision D4);
to-dos never, not even counted."""

from services.accounts.models import User
from services.work.feed_team_tasks import TeamOverdue
from services.work.team_scope import resolve_team
from services.work.tests.feed_fixtures import FeedFixture


class TeamOverdueTests(FeedFixture):
    def source(self, user, key="team"):
        reader = User.objects.get(pk=user.pk)
        return TeamOverdue(reader, resolve_team(reader, key), self.today)

    def test_a_reports_overdue_task_is_listed_read_only_for_its_assignee(self):
        late = self.due(self.csm, self.pizza, due_in=-2, title="Chase the sponsor")
        (key, item) = self.source(self.mona).page(None, 51)[0]
        self.assertEqual((item["key"], item["kind"]), (f"task:{late.pk}", "task"))
        self.assertEqual(item["actions"], ["open"])
        self.assertEqual(item["for"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(item["due_date"], late.due_date.isoformat())
        self.assertEqual(len(key), 4)

    def test_only_overdue_and_not_blocked(self):
        self.due(self.csm, self.pizza, due_in=0, title="Today")
        self.due(self.csm, self.pizza, due_in=3, title="Soon")
        self.due(self.csm, self.pizza, due_in=-1, status="blocked", reason="Legal", title="Stuck")
        late = self.due(self.csm, self.pizza, due_in=-1, title="Late")
        source = self.source(self.mona)
        self.assertEqual([item["id"] for _k, item in source.page(None, 51)], [late.pk])
        self.assertEqual(source.count(), 1)

    def test_the_readers_own_and_to_dos_never_count(self):
        self.due(self.mona, self.soup, due_in=-1, title="Mona's own")
        self.todo(self.csm, due_in=-3, title="Renew my passport")
        source = self.source(self.mona)
        self.assertEqual((source.count(), source.hidden()), (0, 0))
        admin = self.source(self.admin, "company")
        self.assertNotIn("Renew my passport", [item["title"] for _k, item in admin.page(None, 51)])
        self.assertEqual(admin.hidden(), 0)

    def test_a_task_on_a_record_the_reader_cannot_open_is_hidden(self):
        self.due(self.csm, self.west, due_in=-1, title="West handover")
        source = self.source(self.mona)
        self.assertEqual((source.count(), source.hidden()), (0, 1))
        self.assertEqual(source.page(None, 51), [])

    def test_order_is_due_date_then_priority(self):
        older = self.due(self.csm, self.pizza, due_in=-3, priority="low", title="A")
        high = self.due(self.csm, self.dough, due_in=-1, priority="high", title="B")
        low = self.due(self.csm, self.pizza, due_in=-1, priority="low", title="C")
        ids = [item["id"] for _k, item in self.source(self.mona).page(None, 51)]
        self.assertEqual(ids, [older.pk, high.pk, low.pk])

    def test_paging_after_a_position(self):
        first = self.due(self.csm, self.pizza, due_in=-2, title="First")
        second = self.due(self.csm, self.pizza, due_in=-1, title="Second")
        source = self.source(self.mona)
        (position, item) = source.page(None, 1)[0]
        self.assertEqual(item["id"], first.pk)
        self.assertEqual([i["id"] for _k, i in source.page(position, 51)], [second.pk])
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_team_tasks services.customers.tests.test_todo_privacy --parallel auto --noinput`
Expected: FAIL (`No module named 'services.work.feed_team_tasks'`; `cannot import name 'on_record_q'`).

- [ ] **Step 3: Add `on_record_q` and use it everywhere the rule was written out**

In `services/customers/task_access.py`, next to `todo_q`:

```python
def on_record_q():
    """Tasks with a record (an organisation's or an account's): every task
    but a to-do (Work in one place §3)."""
    return Q(customer__isnull=False) | Q(account__isnull=False)
```

and give `is_todo` the docstring `"""Whether `task` is a to-do: a task with no record, its creator's alone."""`.

Replace the written-out `Q(customer__isnull=False) | Q(account__isnull=False)` with `on_record_q()` in:
- `services/customers/personal.py` `visible_tasks` (import inside the function, `from .task_access import on_record_q`, as the module already imports lazily there, to avoid an import cycle),
- `services/work/team.py` `build` (`waiting = open_tasks().filter(assignee_id__in=...).filter(on_record_q())`),
- `services/brain/desk.py` `overdue_tasks` (import inside the function, as its other imports),
- `services/work/feed_tasks.py` `Tasks.__init__` (`self.assigned`).

Keep each `# SOC2:AUTH-02 ...` comment where it is. Leave `services/work/today.py` alone (Task 7 deletes it).

- [ ] **Step 4: Write `services/work/feed_team_tasks.py`**

```python
"""The Team queue's overdue group (Work in one place, delivery 2 contract
§1.4): open tasks with a record, past due and not Blocked (`work.states`),
assigned to the scope's people other than the reader, that the reader may
read. A row only opens the task panel (Decision D4). To-dos never: they
have no record, so they are not even counted."""

from django.db.models import DateField, Value
from django.db.models.functions import Coalesce

from services.customers.task_access import on_record_q, openable_tasks
from services.customers.task_payloads import ROW_RELATED

from .feed_shape import TASK, after_q
from .feed_tasks import NO_DATE, ORDER, PRIORITY_RANK, task_item
from .states import open_tasks, overdue_q
from .team_scope import named, people


class TeamOverdue:
    kind = TASK

    def __init__(self, reader, scope, today):
        self.reader = reader
        # SOC2:AUTH-02 a to-do is its creator's alone: never here, not even as hidden
        self.waiting = (
            open_tasks()
            .filter(assignee_id__in=people(reader, scope))
            .filter(on_record_q())
            .filter(overdue_q(today))
        )
        # SOC2:AUTH-02 the twice-filter: the task's own rule, on a record the reader may open
        self.readable = openable_tasks(reader, self.waiting)

    def count(self):
        return self.readable.count()

    def hidden(self):
        return self.waiting.count() - self.count()

    def page(self, after, limit):
        rows = self.readable.annotate(
            due_key=Coalesce("due_date", Value(NO_DATE), output_field=DateField()),
            prio=PRIORITY_RANK,
        ).select_related(*ROW_RELATED, "created_by", "assignee")
        if after is not None:
            rows = rows.filter(after_q(ORDER, after))
        return [
            (
                (task.due_key, task.prio, task.created_at, task.pk),
                {**task_item(task), "actions": ["open"], "for": named(task.assignee)},
            )
            for task in rows.order_by(*ORDER)[:limit]
        ]
```

- [ ] **Step 5: Run the tests**

Run: `venv/bin/python manage.py test services.work services.customers services.brain --parallel auto --noinput`
Expected: PASS (the refactor changes no behaviour; the new tests pass).

- [ ] **Step 6: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/customers/task_access.py services/customers/personal.py services/work/team.py services/brain/desk.py services/work/feed_tasks.py services/work/feed_team_tasks.py services/work/tests/test_feed_team_tasks.py services/customers/tests/test_todo_privacy.py
git commit -m "feat(work): the Team queue's overdue tasks; one has-a-record rule

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The queue's suggestions

**Files:**
- Create: `services/work/feed_team_suggest.py`
- Create: `services/work/tests/test_feed_team_suggest.py`

**Interfaces:**
- Consumes: `feed_suggest.Suggestions` (`count`, `hidden`, `page(after, limit)`), `feed_suggest.KINDS`; `rec_access.decidable`, `openable`, `TEAM`; `team_scope.people`.
- Produces: `TeamSuggestions(reader, today, scope)` with `.count()`, `.hidden()`, `.page(after, limit) -> [((created_at, id), TeamItem)]`, every item `actions: ["assign", "dismiss"]`, `for` the recipient.

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_feed_team_suggest.py`:

```python
"""The Team queue's suggestions (delivery 2 contract §1.4, Decision D5):
the four live kinds the reader may decide, recipient in scope and not the
reader, on records they may open; newest first; Assign and Dismiss only."""

from django.utils import timezone

from services.accounts.models import User
from services.work.feed_team_suggest import TeamSuggestions
from services.work.models import Recommendation
from services.work.team_scope import resolve_team
from services.work.tests.feed_fixtures import FeedFixture


class TeamSuggestionTests(FeedFixture):
    def source(self, user, key="team"):
        reader = User.objects.get(pk=user.pk)
        return TeamSuggestions(reader, self.today, resolve_team(reader, key))

    def items(self, source):
        return [entry for _key, entry in source.page(None, 51)]

    def test_a_reports_suggestion_is_listed_for_its_recipient(self):
        rec = self.suggestion(self.csm, self.pizza)
        (item,) = self.items(self.source(self.mona))
        self.assertEqual((item["key"], item["kind"]), (f"recommendation:{rec.pk}", "suggestion"))
        self.assertEqual(item["actions"], ["assign", "dismiss"])
        self.assertEqual(item["for"], {"id": self.csm.pk, "name": "Carl CSM"})

    def test_the_readers_own_and_retired_kinds_stay_out(self):
        self.suggestion(self.mona, self.soup)
        self.suggestion(self.csm, self.pizza, kind="overdue_tasks")
        self.suggestion(self.csm, self.dough, kind="open_questions")
        source = self.source(self.mona)
        self.assertEqual((source.count(), source.hidden()), (0, 0))

    def test_one_the_reader_may_not_decide_is_neither_listed_nor_counted(self):
        self.suggestion(self.other, self.taco)  # Dana's: not below Mona
        source = self.source(self.mona)
        self.assertEqual((source.count(), source.hidden()), (0, 0))

    def test_company_lists_everyone_elses_for_view_all(self):
        dana = self.suggestion(self.other, self.taco)
        carl = self.suggestion(self.csm, self.pizza)
        ids = {item["id"] for item in self.items(self.source(self.admin, "company"))}
        self.assertEqual(ids, {dana.pk, carl.pk})

    def test_a_decidable_one_on_a_record_the_reader_cannot_open_is_hidden(self):
        self.suggestion(self.csm, self.west)
        source = self.source(self.mona)
        self.assertEqual((source.count(), source.hidden()), (0, 1))

    def test_newest_first_and_a_same_time_tie_breaks_by_id(self):
        first = self.suggestion(self.csm, self.pizza)
        second = self.suggestion(self.csm, self.dough)
        stamp = timezone.now()
        Recommendation.objects.filter(pk__in=[first.pk, second.pk]).update(created_at=stamp)
        source = self.source(self.mona)
        self.assertEqual([i["id"] for i in self.items(source)], [second.pk, first.pk])
        (position, _item) = source.page(None, 1)[0]
        self.assertEqual([i["id"] for _k, i in source.page(position, 51)], [first.pk])
```

The last test also closes delivery 1's deferred minor "no same-timestamp tie-break test for the suggested keyset".

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_team_suggest --parallel auto --noinput`
Expected: FAIL with `No module named 'services.work.feed_team_suggest'`.

- [ ] **Step 3: Write `services/work/feed_team_suggest.py`**

```python
"""The Team queue's suggestions (Work in one place, delivery 2 contract
§1.4, Decision D5): open recommendations of the four live kinds that the
reader may decide (`rec_access.decidable`, the rule behind Recommended's
My team), sent to someone in scope other than the reader, on records the
reader may open. Ones the reader may not decide are neither listed nor
counted. A row offers Assign and Dismiss; Add to my work is My work's."""

from . import feed_suggest
from .feed_suggest import KINDS
from .rec_access import TEAM, decidable, openable
from .team_scope import people


class TeamSuggestions(feed_suggest.Suggestions):
    def __init__(self, reader, today, scope):
        self.reader, self.today = reader, today
        # SOC2:AUTH-02 only what the reader may decide, sent to someone in scope but them
        self.waiting = (
            decidable(reader, TEAM)
            .filter(kind__in=KINDS)
            .filter(recipient_id__in=people(reader, scope))
        )
        # SOC2:AUTH-02 named only on records the reader may open; the rest counted
        self.readable = openable(reader, self.waiting)

    def page(self, after, limit):
        return [
            (
                position,
                {
                    **entry,
                    "actions": ["assign", "dismiss"],
                    "for": dict(entry["detail"]["recipient"]),
                },
            )
            for position, entry in super().page(after, limit)
        ]
```

- [ ] **Step 4: Run them to see them pass**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_team_suggest services.work.tests.test_feed_suggest --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/work/feed_team_suggest.py services/work/tests/test_feed_team_suggest.py
git commit -m "feat(work): the Team queue's suggestions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `GET /work/feed/team/`

**Files:**
- Modify: `services/work/feed.py` (rename `_attempt` → `attempt`, `_ordered` → `ordered`; update its own call sites)
- Create: `services/work/feed_team.py`
- Modify: `services/work/views.py` (add `TeamQueueView`), `services/work/urls.py`
- Create: `services/work/tests/test_feed_team_api.py`, `services/work/tests/test_feed_team_queries.py`

**Interfaces:**
- Consumes: Tasks 1–4; `feed_shape.DECIDE`, `SUGGESTED`, `TASK`, `SUGGESTION`, `PAGE`, `group`, `decode`, `BadQuery`, `CURSOR_NEEDS_GROUP`; `brain.http.ScopeRefusals`.
- Produces: `feed.attempt(kinds, failed, run)`, `feed.ordered(failed)`; `feed_team.TEAM_GROUPS = ("decide", "overdue", "suggested")`, `feed_team.CHOOSE_TEAM_GROUP`, `feed_team.build(reader, scope, *, today) -> dict`, `feed_team.page(reader, scope, *, today, group_key, cursor) -> dict`; route name `work-feed-team`.

- [ ] **Step 1: Write the failing API tests**

Create `services/work/tests/test_feed_team_api.py`:

```python
"""GET /work/feed/team/ (delivery 2 contract §1): the scope's people's
decisions, overdue tasks and suggestions, minus the reader's own; access
and refusals; paging; partial failure; privacy."""

import json
from unittest.mock import patch

from rest_framework.test import APIClient

from services.rules.models import Rule
from services.work import feed_team_decide
from services.work.tests.feed_fixtures import TEAM, FeedFixture


class TeamQueueApiTests(FeedFixture):
    def everything(self):
        """Carl's items Mona may see, Mona's own, and what she may not."""
        self.review_ = self.review(self.csm, sharing=Rule.Sharing.WORKSPACE)
        self.action = self.proposal(self.pizza)
        self.asked = self.question(self.csm, customer=self.pizza)
        for days, row in ((3, self.review_), (2, self.action), (1, self.asked)):
            self.age(row, days)
        self.late = self.due(self.csm, self.pizza, due_in=-1, title="Chase the sponsor")
        self.rec = self.suggestion(self.csm, self.dough)
        # Never on Mona's queue:
        self.proposal(self.soup, title="Mona's own play")
        self.todo(self.csm, due_in=-2, title="Renew my passport")
        self.reply(self.csm, self.dough)
        self.due(self.csm, self.west, due_in=-1, title="West handover")  # hidden

    def test_the_whole_queue(self):
        self.everything()
        body = self.queue_body(self.mona, scope="team")
        self.assertEqual(body["scope"], "team")
        self.assertEqual([g["key"] for g in body["groups"]], ["decide", "overdue", "suggested"])
        self.assertEqual(
            [i["key"] for i in self.group(body, "decide")["items"]],
            [
                f"rule_review:{self.review_.pk}",
                f"agent_action:{self.action.pk}",
                f"question:{self.asked.pk}",
            ],
        )
        self.assertEqual([i["id"] for i in self.group(body, "overdue")["items"]], [self.late.pk])
        self.assertEqual([i["id"] for i in self.group(body, "suggested")["items"]], [self.rec.pk])
        self.assertEqual((body["hidden"], body["failed"]), (1, []))
        for group in body["groups"]:
            for item in group["items"]:
                self.assertEqual(item["for"], {"id": self.csm.pk, "name": "Carl CSM"})
                self.assertFalse(item["private"])
        text = json.dumps(body)
        for secret in ("Mona's own play", "Renew my passport", "West handover", "draft:"):
            self.assertNotIn(secret, text)

    def test_the_default_scope(self):
        self.assertEqual(self.queue_body(self.mona)["scope"], "team")
        self.assertEqual(self.queue_body(self.admin)["scope"], "company")
        self.assertEqual(self.queue_body(self.lee)["scope"], "company")

    def test_access_and_refusals(self):
        not_allowed = {"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}
        unknown = {"code": "SCOPE_UNKNOWN", "detail": "Choose team or company."}
        for user, params, status, body in (
            (self.csm, {}, 403, not_allowed),
            (self.csm, {"scope": "team"}, 403, not_allowed),
            (self.other, {"scope": "company"}, 403, not_allowed),
            (self.mona, {"scope": "company"}, 403, not_allowed),
            (self.admin, {"scope": "team"}, 403, not_allowed),
            (self.mona, {"scope": "me"}, 400, unknown),
            (self.mona, {"scope": ""}, 400, unknown),
            (self.mona, {"scope": "everyone"}, 400, unknown),
            (
                self.mona,
                {"scope": "team", "cursor": "x"},
                400,
                {"cursor": ["Say which group to page."]},
            ),
            (
                self.mona,
                {"scope": "team", "group": "today"},
                400,
                {"group": ["Choose decide, overdue or suggested."]},
            ),
            (
                self.mona,
                {"scope": "team", "group": "overdue", "cursor": "nope"},
                400,
                {"cursor": ["That list has changed. Reload Work."]},
            ),
        ):
            with self.subTest(user=user.name, params=params):
                response = self.queue(user, **params)
                self.assertEqual((response.status_code, response.json()), (status, body))
        self.assertEqual(APIClient().get(TEAM).status_code, 401)

    def test_a_scope_refusal_comes_before_a_bad_group(self):
        response = self.queue(self.csm, scope="team", group="today")
        self.assertEqual(response.status_code, 403)

    def test_paging_one_group(self):
        late = [self.due(self.csm, self.pizza, due_in=-1 - n, title=f"Late {n}") for n in range(52)]
        body = self.queue_body(self.mona, scope="team")
        overdue = self.group(body, "overdue")
        self.assertEqual((overdue["count"], len(overdue["items"])), (52, 50))
        page = self.queue_body(self.mona, scope="team", group="overdue", cursor=overdue["next"])
        self.assertEqual(page["scope"], "team")
        self.assertEqual([i["id"] for i in page["group"]["items"]], [late[1].pk, late[0].pk])
        self.assertIsNone(page["group"]["next"])
        first = self.queue_body(self.mona, scope="team", group="overdue")
        self.assertEqual(len(first["group"]["items"]), 50)

    def test_a_failing_source_only_adds_its_kind_to_failed(self):
        self.everything()
        with patch.object(feed_team_decide.TeamQuestions, "count", side_effect=RuntimeError):
            body = self.queue_body(self.mona, scope="team")
        self.assertEqual(body["failed"], ["question"])
        self.assertEqual(self.group(body, "decide")["count"], 2)
        self.assertEqual(self.group(body, "overdue")["count"], 1)

    def test_company_for_view_all_names_workspace_level_actions_for_the_whole_company(self):
        from services.agents.tests.builder_fixtures import builder_action, definition

        action = builder_action(self.org, "segment.create", definition())
        body = self.queue_body(self.admin, scope="company")
        decide = {i["id"]: i for i in self.group(body, "decide")["items"]}
        self.assertIsNone(decide[action.pk]["for"])
        self.assertEqual(decide[action.pk]["actions"], ["approve", "reject"])
        lee = self.queue_body(self.lee, scope="company")
        self.assertNotIn(action.pk, [i["id"] for i in self.group(lee, "decide")["items"]])
        self.assertEqual(lee["hidden"], 0)

    def test_another_workspace_never_sees_ours(self):
        self.everything()
        text = json.dumps(self.queue_body(self.admin, scope="company"))
        self.assertNotIn("Globex", text)
        self.assertEqual(self.queue(self.stranger).status_code, 403)
```

Create `services/work/tests/test_feed_team_queries.py`:

```python
"""The Team queue costs the same however many items wait (delivery 2
contract §1.7), under a pinned ceiling, and no query uses DISTINCT."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.models import User
from services.rules.models import Rule
from services.work.tests.feed_fixtures import TEAM, FeedFixture

#: Measured on this branch (Task 5, Step 6); raise only with a reason in the commit.
TEAM_CEILING = 0
PAIRS = [
    ("renewal_due", "pizza"),
    ("health_drop", "pizza"),
    ("urgent_tickets", "pizza"),
    ("anomaly", "pizza"),
    ("renewal_due", "dough"),
    ("health_drop", "dough"),
]


class TeamQueueQueryTests(FeedFixture):
    def seed(self, n):
        kind, on = PAIRS[n]
        self.review(self.csm, name=f"Rule {n}", sharing=Rule.Sharing.WORKSPACE)
        self.proposal(self.pizza, title=f"Play {n}")
        self.question(self.csm, customer=self.pizza, text=f"Question {n}")
        self.due(self.csm, self.pizza, due_in=-1, title=f"Late {n}")
        self.due(self.csm, self.west, due_in=-1, title=f"Hidden {n}")
        self.todo(self.csm, due_in=-1, title=f"To-do {n}")
        self.suggestion(self.csm, getattr(self, on), kind=kind)

    def measure(self, user, scope):
        url = f"{TEAM}?scope={scope}"
        client = self.as_user(User.objects.get(pk=user.pk))
        client.get(url)  # warm per-process caches
        client = self.as_user(User.objects.get(pk=user.pk))
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(client.get(url).status_code, 200)
        return queries

    def check(self, user, scope):
        self.seed(0)
        few = self.measure(user, scope)
        for n in range(1, len(PAIRS)):
            self.seed(n)
        many = self.measure(user, scope)
        self.assertEqual(len(few), len(many), [q["sql"] for q in many.captured_queries])
        self.assertLessEqual(len(many), TEAM_CEILING)
        for query in many.captured_queries:
            self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])

    def test_my_team_costs_the_same_however_many_items_wait(self):
        self.check(self.mona, "team")

    def test_company_costs_the_same_however_many_items_wait(self):
        self.check(self.admin, "company")
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_team_api services.work.tests.test_feed_team_queries --parallel auto --noinput`
Expected: FAIL (the route is 404).

- [ ] **Step 3: Make `attempt` and `ordered` public in `services/work/feed.py`**

Rename `_attempt` to `attempt` and `_ordered` to `ordered` (definitions and every call in the module). No behaviour change; the docstrings stay. Then run `venv/bin/python manage.py test services.work.tests.test_feed_api --parallel auto --noinput` → PASS.

- [ ] **Step 4: Write `services/work/feed_team.py`**

```python
"""Work › Team's "Waiting on your team" (Work in one place, delivery 2
contract §1): the feed's shape over the scope's people other than the
reader, in three groups. Each source runs in its own savepoint (`feed.
attempt`), so one failing only adds its kind to `failed`; pages are the
feed's keyset cursors."""

from . import feed_team_decide
from .feed import attempt, ordered
from .feed_shape import (
    APPROVAL,
    DECIDE,
    PAGE,
    QUESTION,
    RULE_REVIEW,
    SUGGESTED,
    SUGGESTION,
    TASK,
    decode,
    group,
)
from .feed_team_suggest import TeamSuggestions
from .feed_team_tasks import TeamOverdue

OVERDUE = "overdue"
TEAM_GROUPS = (DECIDE, OVERDUE, SUGGESTED)
#: In the order a tie on `at` is broken (the feed's).
TEAM_DECIDE_KINDS = (RULE_REVIEW, APPROVAL, QUESTION)
CHOOSE_TEAM_GROUP = "Choose decide, overdue or suggested."


def _decide(reader, scope, after, failed):
    count = hidden = 0
    rows = []
    for kind in TEAM_DECIDE_KINDS:

        def run(kind=kind):
            source = feed_team_decide.MAKERS[kind](reader, scope)
            return source.count(), source.hidden(), source.page(after, PAGE + 1)

        got = attempt([kind], failed, run)
        if got is not None:
            count += got[0]
            hidden += got[1]
            rows += got[2]
    rows.sort(key=lambda row: row[0])
    return group(DECIDE, count, rows), hidden


def _one(key, kind, make, after, failed):
    def run():
        source = make()
        return source.count(), source.hidden(), source.page(after, PAGE + 1)

    got = attempt([kind], failed, run)
    if got is None:
        return group(key, 0, []), 0
    return group(key, got[0], got[2]), got[1]


def _overdue(reader, scope, today, after, failed):
    return _one(OVERDUE, TASK, lambda: TeamOverdue(reader, scope, today), after, failed)


def _suggested(reader, scope, today, after, failed):
    return _one(SUGGESTED, SUGGESTION, lambda: TeamSuggestions(reader, today, scope), after, failed)


def build(reader, scope, *, today):
    failed = []
    decide, decide_hidden = _decide(reader, scope, None, failed)
    overdue, overdue_hidden = _overdue(reader, scope, today, None, failed)
    suggested, suggested_hidden = _suggested(reader, scope, today, None, failed)
    return {
        "scope": scope.key,
        "groups": [decide, overdue, suggested],
        "hidden": decide_hidden + overdue_hidden + suggested_hidden,
        "failed": ordered(failed),
    }


def page(reader, scope, *, today, group_key, cursor):
    """One group's page after `cursor` (None: its first page)."""
    after = None if cursor is None else decode(group_key, cursor)
    failed = []
    if group_key == DECIDE:
        payload, _hidden = _decide(reader, scope, after, failed)
    elif group_key == OVERDUE:
        payload, _hidden = _overdue(reader, scope, today, after, failed)
    else:
        payload, _hidden = _suggested(reader, scope, today, after, failed)
    return {"scope": scope.key, "group": payload, "failed": ordered(failed)}
```

- [ ] **Step 5: The view and the route**

In `services/work/views.py`, add `feed_team` to the `from . import ...` line, `from .team_scope import resolve_team` and `from .feed_team import CHOOSE_TEAM_GROUP, TEAM_GROUPS`, then after `FeedCountView`:

```python
class TeamQueueView(ScopeRefusals, APIView):
    """GET /api/v1/work/feed/team/?scope=team|company&group=&cursor= — what
    waits on the reader's team (delivery 2 contract §1)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        # SOC2:AUTH-02 a scope the reader may not use is refused before anything is read
        scope = resolve_team(request.user, params.get("scope"))
        group_key, cursor = params.get("group"), params.get("cursor")
        try:
            if group_key is None and cursor is not None:
                raise BadQuery("cursor", CURSOR_NEEDS_GROUP)
            if group_key is not None and group_key not in TEAM_GROUPS:
                raise BadQuery("group", CHOOSE_TEAM_GROUP)
            on = today_for(request.user.organisation)
            if group_key is None:
                return Response(feed_team.build(request.user, scope, today=on))
            return Response(
                feed_team.page(request.user, scope, today=on, group_key=group_key, cursor=cursor)
            )
        except BadQuery as exc:
            raise ValidationError({exc.field: [exc.message]}) from None
```

In `services/work/urls.py`, after the `feed/count/` path:

```python
(path("feed/team/", views.TeamQueueView.as_view(), name="work-feed-team"),)
```

- [ ] **Step 6: Run the API tests, then measure and pin the ceiling**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_team_api --parallel auto --noinput` → PASS.

Measure: temporarily set `TEAM_CEILING = 10_000`, then run
`venv/bin/python manage.py test services.work.tests.test_feed_team_queries --noinput -v 2` with a temporary `print(len(many))` in `check`. Set `TEAM_CEILING` to the larger of the two printed numbers, remove the print, and re-run (PASS). Record both numbers in the commit body (they are copied into the docs in Task 12). If the two scopes differ by more than 10 queries, find the per-scope cost before pinning (a query that grows with people, not items, is acceptable only for the suggestions' assignee check, contract §1.7).

- [ ] **Step 7: Run the Work and Brain suites**

Run: `venv/bin/python manage.py test services.work services.brain --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 8: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/work/feed.py services/work/feed_team.py services/work/views.py services/work/urls.py services/work/tests/test_feed_team_api.py services/work/tests/test_feed_team_queries.py
git commit -m "feat(work): GET /work/feed/team/, what waits on the reader's team

Ceiling: team <n>, company <m> queries (measured).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Links into Work

**Files:**
- Modify: `services/customers/task_changes.py` (`link`), `services/work/digest.py` (the "Open Work" line), `services/work/recommend.py` (`RECOMMENDED_LINK`), `services/rules/nightly.py` (the `rule_review` notice's link)
- Modify tests: `services/customers/tests/test_task_creation.py` (2 places), `services/customers/tests/test_task_changes.py`, `services/work/tests/test_tracking.py`, `services/work/tests/test_digest.py`, `services/work/tests/test_refresh.py` (4 places), `services/rules/tests/test_review_kinds.py`, `services/rules/tests/test_campaign_action.py`, `services/rules/tests/test_nightly.py` (3 places), `e2e/test_work_flow.py`, `e2e/test_work_recommended_flow.py`

**Interfaces:**
- Produces: task notice links `/work/mine?task=<id>`; `recommend.SUGGESTED_LINK = "/work/mine?kind=suggestion"` (renamed from `RECOMMENDED_LINK`); `rules.nightly.REVIEWS_LINK = "/work/mine?kind=approval"`; digest line `Open Work: <FRONTEND_URL>/work/mine`.

- [ ] **Step 1: Change the tests first**

Every assertion of an old link becomes the new one (contract §4):
- `f"/work/today?task={...}"` → `f"/work/mine?task={...}"` in `test_task_creation.py` (lines ~68, ~128), `test_task_changes.py` (~175), `test_tracking.py` (~70), and the two e2e files (`test_work_flow.py` ~80, `test_work_recommended_flow.py` ~127).
- `"/work/recommended"` → `"/work/mine?kind=suggestion"` in `test_refresh.py` (~466, ~470, ~535, ~545) and `e2e/test_work_recommended_flow.py` (~91).
- `"/brain/review"` → `"/work/mine?kind=approval"` in `test_review_kinds.py` (~127), `test_campaign_action.py` (~240), `test_nightly.py` (~439, ~510, ~591).
- `test_digest.py` (~45): `self.assertIn("/work/mine", message.body)` and add `self.assertNotIn("/work/today", message.body)`.

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.customers.tests.test_task_creation services.customers.tests.test_task_changes services.work.tests.test_tracking services.work.tests.test_digest services.work.tests.test_refresh services.rules --parallel auto --noinput`
Expected: FAIL on every changed link.

- [ ] **Step 3: Change the links**

`services/customers/task_changes.py`:

```python
def link(task):
    """The task panel, opened over My work (Work in one place, delivery 2)."""
    return f"/work/mine?task={task.pk}"
```

`services/work/digest.py`: the line becomes `f"Open Work: {settings.FRONTEND_URL}/work/mine",`.

`services/work/recommend.py`: replace `RECOMMENDED_LINK = "/work/recommended"` with `SUGGESTED_LINK = "/work/mine?kind=suggestion"` and use it in `notify_waiting` (`link=SUGGESTED_LINK`).

`services/rules/nightly.py`: add the module constant `REVIEWS_LINK = "/work/mine?kind=approval"` (comment: "My work's Approvals chip holds rule reviews (Work in one place, delivery 2).") and use `link=REVIEWS_LINK` in the `rule_review` notice. Grep `services/rules` for any other `"/brain/review"` used as a notification link (`grep -rn '"/brain/review"' services --include='*.py' | grep -v tests`) and point it at `REVIEWS_LINK` too; the Copilot skills' `"/brain/review"` page lists (`services/copilot/skills.py`) are page catalogues, not links, and stay.

- [ ] **Step 4: Run them to see them pass**

Run the Step 2 command, plus `venv/bin/python manage.py test e2e.test_work_flow e2e.test_work_recommended_flow --noinput`.
Expected: PASS. (The e2e files still read `/work/today/` until Task 7.)

- [ ] **Step 5: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/customers/task_changes.py services/work/digest.py services/work/recommend.py services/rules/nightly.py services/customers/tests/test_task_creation.py services/customers/tests/test_task_changes.py services/work/tests/test_tracking.py services/work/tests/test_digest.py services/work/tests/test_refresh.py services/rules/tests/test_review_kinds.py services/rules/tests/test_campaign_action.py services/rules/tests/test_nightly.py e2e/test_work_flow.py e2e/test_work_recommended_flow.py
git commit -m "feat: notification and digest links open My work

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Remove `GET /work/today/`

**Files:**
- Modify: `services/work/views.py` (delete `TodayView`; drop `today` from the `from . import` line), `services/work/urls.py` (delete the `today/` path), `services/work/feed_tasks.py` (module docstring: "as `/work/today`" → "as Today did")
- Delete: `services/work/today.py`, `services/work/tests/test_today.py`
- Modify tests: `services/work/tests/test_privacy.py`, `services/work/tests/test_queries.py`, `services/work/tests/test_clock.py`, `services/customers/tests/test_todo_privacy.py`, `e2e/test_work_flow.py`, `e2e/test_work_recommended_flow.py`, `services/work/tests/test_feed_api.py` (one new test)

- [ ] **Step 1: Change the tests first**

1. `services/work/tests/test_feed_api.py`, append to `FeedApiTests`:

```python
    def test_today_is_gone(self):
        self.assertEqual(self.as_user(self.csm).get("/api/v1/work/today/").status_code, 404)
```

2. `services/work/tests/test_privacy.py` `bodies`: replace `"/api/v1/work/today/"` with `"/api/v1/work/feed/"`, and add `f"/api/v1/work/feed/team/?scope={scope}"` for `scope in ("team", "company")` to `urls` (403 is already accepted for scopes a reader may not use).
3. `services/work/tests/test_queries.py` `test_no_distinct_in_any_work_query`: drop `today` from the import line and replace `today.build(reader, today=self.today)` with `feed.build(reader, today=self.today, kinds=frozenset(KINDS))` (import `feed` from `services.work` and `KINDS` from `services.work.feed_shape`).
4. `services/work/tests/test_clock.py` `test_the_today_route_uses_the_workspace_date` becomes:

```python
    def test_the_feed_uses_the_workspace_date(self):
        self.prefer(timezone="Asia/Kolkata")
        Task.objects.filter(pk=self.overdue.pk).update(due_date=date(2026, 10, 8))
        with patch("django.utils.timezone.now", return_value=LATE_WEDNESDAY):
            data = self.ok(self.csm, "/api/v1/work/feed/?kind=task")
        today = next(g for g in data["groups"] if g["key"] == "today")
        self.assertIn(self.overdue.pk, [i["id"] for i in today["items"]])
```

(Import `date` and `Task` if the module lacks them. `LATE_WEDNESDAY` is the file's existing constant: 2026-10-08 in Kolkata, still 2026-10-07 in UTC; `self.overdue` is the fixture's task of Carl's. If the fixture's task is not Carl's or has no record, use `WorkFixture`'s Carl task on Pizza Hut.)
5. `services/customers/tests/test_todo_privacy.py` `test_no_existing_list_shows_or_counts_a_to_do`: in `counted` replace `"/api/v1/work/today/"`, `"/api/v1/brain/waiting/?scope=me"` and `"/api/v1/brain/waiting/count/"` with `"/api/v1/work/feed/team/?scope=team"` and `"/api/v1/work/feed/team/?scope=company"`. Wrap both `read(...)` calls in `with self.assertLogs("django.request", "WARNING"):` (Lee's 404 on Pizza Hut's tasks and the 403s log warnings; this closes delivery 1's deferred minor about the stray 404 warning).
6. `e2e/test_work_flow.py`: add a helper method to the class

```python
    @staticmethod
    def group(body, key):
        return next(g for g in body["groups"] if g["key"] == key)
```

and replace the two `/work/today/` reads:

```python
        status, body = http_get(self.api("/work/feed/?kind=task"), token=tokens["carl"])
        self.assertEqual([r["id"] for r in self.group(body, "today")["items"]], [task_id])
        self.assertEqual(self.group(body, "overdue")["count"], 0)
```

and, after the task is completed:

```python
        status, body = http_get(self.api("/work/feed/?kind=task"), token=tokens["carl"])
        self.assertEqual(sum(g["count"] for g in body["groups"]), 0)
```

Update the step comments "finds it in Today" → "finds it on My work", "it leaves Today" → "it leaves My work".
7. `e2e/test_work_recommended_flow.py` (~128): the same `group` helper, and

```python
        status, body = http_get(self.api("/work/feed/?kind=task"), token=tokens["carl"])
        self.assertEqual([r["id"] for r in self.group(body, "week")["items"]], [task_id])
```

- [ ] **Step 2: Run them to see the 404 test fail**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_api --parallel auto --noinput`
Expected: FAIL on `test_today_is_gone` (200 ≠ 404).

- [ ] **Step 3: Delete the route and its builder**

`git rm services/work/today.py services/work/tests/test_today.py`; delete `TodayView` and the `today/` path; fix the `from . import` line. Then `grep -rn "work\.today\|from \.today\|today import" services e2e --include='*.py'` must print nothing.

- [ ] **Step 4: Run the affected suites**

Run: `venv/bin/python manage.py test services.work services.customers e2e.test_work_flow e2e.test_work_recommended_flow --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/work/views.py services/work/urls.py services/work/feed_tasks.py services/work/tests/test_feed_api.py services/work/tests/test_privacy.py services/work/tests/test_queries.py services/work/tests/test_clock.py services/customers/tests/test_todo_privacy.py e2e/test_work_flow.py e2e/test_work_recommended_flow.py
git commit -m "feat(work)!: remove GET /work/today/ (My work's feed replaces it)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Remove `/brain/waiting/` and its count; carry their tests to the queue

**Files:**
- Modify: `services/brain/urls.py` (delete the two `waiting` paths), `services/brain/views.py` (delete `WaitingView`, `WaitingCountView`; drop `waiting` from the `from . import` line), `services/brain/waiting.py` (delete `count`; module docstring: "Kept for Ask Revenact's grounding (`copilot.brain_grounding`); the page and its routes are gone (Work in one place, delivery 2).")
- Delete: `services/brain/tests/test_api_waiting.py`, `services/brain/tests/test_waiting_e2e.py`
- Create: `services/work/tests/test_feed_team_e2e.py` (the Waiting journeys, re-pointed)
- Modify: `services/work/tests/test_feed_api.py` (the badge's sessions cost), `services/agents/tests/test_waiting.py`, `services/agents/tests/test_builder_access.py`, `services/agents/tests/test_builder_e2e.py`, `services/agents/tests/test_draft_privacy.py`, `services/agents/tests/test_queries.py`, `services/metrics/proposal_access.py` (docstring references only)

**Interfaces:**
- Consumes: Task 5's route; `FeedFixture.queue_body`.
- Produces: nothing new. `brain.waiting.build` keeps working for `copilot.brain_grounding` (contract Decision D13); `services/brain/tests/test_waiting.py` (which tests `build`) stays unchanged.

- [ ] **Step 1: Re-point the tests first**

1. Create `services/work/tests/test_feed_team_e2e.py` from `services/brain/tests/test_waiting_e2e.py`, class `TeamQueueJourneyTests(FeedFixture)`, keeping each journey and its assertions' intent:
   - `test_a_manager_approves_a_reports_task_proposal_from_my_team`: `(item,) = self.group(mona.get(f"{TEAM}?scope=team").json(), "decide")["items"]`; assert `item["kind"] == "approval"`, `item["for"] == {"id": self.csm.id, "name": "Carl CSM"}`, `item["actions"] == ["approve", "reject"]`; the approve, the task and the `decided_as == "chain"` audit as before; then the decide group is empty and `self.as_user(self.csm).get("/api/v1/work/feed/count/").json()["decide"] == 0`.
   - `test_a_csm_decides_a_proposal_on_their_own_customer`: the count is `GET /work/feed/count/` `decide` (1, then 0); the item is the decide group's of `GET /work/feed/?kind=approval`.
   - `test_a_csm_without_view_all_cannot_decide_an_initiative`: Carl's `GET /work/feed/?kind=approval` decide group is empty; the 404 body is unchanged.
   - `test_waiting_count_for_a_member` → `test_the_badge_for_a_member`: Dana's `GET /work/feed/count/` is `{"decide": 3, "overdue": 1, "badge": 4, "failed": []}` (the review, the question and the proposal decide; the task is overdue). Use `self.task(self.other, customer=self.taco)` as before.
   - `test_a_pending_session_invite_grants_no_session_proposal_in_me`: Carl's feed decide group is empty and his count's `decide` is 0.
   - `test_a_company_reader_never_sees_another_organisations_items`: Alice's `GET /work/feed/team/?scope=company` decide group holds exactly the Pizza Hut approval (`record == {"type": "customer", "id": self.pizza.id, "name": "Pizza Hut"}`).
2. `services/work/tests/test_feed_api.py`: port `test_the_badge_costs_the_same_however_many_sessions_hold_proposals` from `test_api_waiting.py` unchanged in logic, against `COUNT` (`/api/v1/work/feed/count/`), asserting `carl.get(COUNT).json()["badge"] == 0` both times and equal query counts.
3. `services/agents/tests/test_waiting.py`: rename the class `TeamQueueAgentTests`; `URL = "/api/v1/work/feed/team/?scope=company"`; read items as `[i for g in body["groups"] if g["key"] == "decide" for i in g["items"] if i["kind"] == "approval"]`; Alice's kinds stay `["initiative.create", "record.lifecycle"]`; Mona's `?scope=team` row: `detail["kind"] == "record.lifecycle"`, `detail["evidence"] == []`, `actions == ["approve", "reject"]`, `detail["session"] is None`, `record["type"] == "customer"`, `for == {"id": self.csm.pk, "name": "Carl CSM"}`. Drop the two `counts` assertions (the queue has no per-kind counts).
4. `services/agents/tests/test_builder_access.py` `test_waiting_never_counts_it_hidden` → `test_the_team_queue_never_counts_it_hidden`: Lee's company queue has `hidden == 0` and no approval with that id; Alice's company decide group has exactly one approval (the builder action, `for` None).
5. `services/agents/tests/test_builder_e2e.py`: in `pages`, `(self.admin, "/api/v1/brain/waiting/?scope=company")` → `(self.admin, "/api/v1/work/feed/team/?scope=company")`.
6. `services/agents/tests/test_draft_privacy.py` `test_waiting_names_it_only_to_its_sources_readers` → `test_the_team_queue_names_it_only_to_its_sources_readers`: `agent_items` reads `/api/v1/work/feed/team/?scope={scope}` and collects the decide group's `approval` ids; the expectations are unchanged (`{email_action}` for Mona's team, `{ticket_action}` and `hidden >= 1` for Alice's company).
7. `services/agents/tests/test_queries.py`: `(self.mona, "/api/v1/brain/waiting/?scope=team")` → `(self.mona, "/api/v1/work/feed/team/?scope=team")`.
8. Add to `services/work/tests/test_feed_api.py`:

```python
    def test_brain_waiting_is_gone(self):
        for url in ("/api/v1/brain/waiting/?scope=me", "/api/v1/brain/waiting/count/"):
            self.assertEqual(self.as_user(self.csm).get(url).status_code, 404, url)
```

- [ ] **Step 2: Run them to see the removal test fail**

Run: `venv/bin/python manage.py test services.work.tests.test_feed_api services.work.tests.test_feed_team_e2e services.agents --parallel auto --noinput`
Expected: FAIL only on `test_brain_waiting_is_gone` (the routes still answer). Every re-pointed test PASSES already (the queue exists since Task 5). If one fails, compare with the Waiting test it came from: the difference must be Decision D1 (the reader's own items are not in the queue); move the fixture's item onto someone below the reader rather than loosening the assertion.

- [ ] **Step 3: Delete the routes, the views and `count`**

`git rm services/brain/tests/test_api_waiting.py services/brain/tests/test_waiting_e2e.py`; edit `urls.py`, `views.py` and `waiting.py` as listed. In `services/metrics/proposal_access.py` change the docstring references "services/brain/waiting.py" to "services/brain/desk.py". Then:

```bash
grep -rn "brain/waiting\|WaitingView\|WaitingCountView\|waiting\.count" services e2e --include='*.py'
```

must print only `services/work/tests/test_feed_api.py` (the 404 test).

- [ ] **Step 4: Run the affected suites**

Run: `venv/bin/python manage.py test services.brain services.work services.agents services.metrics services.copilot services.customers --parallel auto --noinput`
Expected: PASS (Brain's Ask grounding still builds "waiting" through `waiting.build`).

- [ ] **Step 5: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/brain/urls.py services/brain/views.py services/brain/waiting.py services/metrics/proposal_access.py services/work/tests/test_feed_team_e2e.py services/work/tests/test_feed_api.py services/agents/tests/test_waiting.py services/agents/tests/test_builder_access.py services/agents/tests/test_builder_e2e.py services/agents/tests/test_draft_privacy.py services/agents/tests/test_queries.py
git commit -m "feat(brain)!: remove /brain/waiting/ and its count; their checks run on the Team queue

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Retire three recommendation kinds

**Files:**
- Modify: `services/work/models.py` (`DEFAULT_SOURCES`, `Recommendation.DismissReason`, `RETIRED_KINDS`, `LIVE_KINDS`)
- Create: `services/work/migrations/0006_retire_recommendation_kinds.py` (generated, then the data step added)
- Modify: `services/work/sources.py` (delete `overdue_tasks`, `open_questions`, `agent_action` and their `SOURCES` entries), `services/work/recommend.py` (`refresh` reads `LIVE_KINDS`; `SOURCE_KEYS` deleted), `services/work/routing.py` (`FUNCTION_FOR` without `OPEN_QUESTIONS`), `services/work/defaults.py` (`PRIORITY` without the two retired kinds), `services/work/views.py` (`DismissSerializer` choices), `services/agents/views.py` (Run now no longer refreshes recommendations)
- Create: `services/work/tests/test_retired_kinds.py`
- Modify tests: listed in Step 5

**Interfaces:**
- Produces: `models.RETIRED_KINDS = ("overdue_tasks", "open_questions", "agent_action")`, `models.LIVE_KINDS = ("renewal_due", "health_drop", "urgent_tickets", "anomaly")`, `Recommendation.DismissReason.RETIRED = "retired"`, `views.CHOOSABLE_REASONS` (the four a person may send); migration function `close_retired(apps, schema_editor)`.

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_retired_kinds.py`:

```python
"""Retired recommendation kinds (delivery 2 contract §2): never produced,
closed by the migration as dismissed/retired, not a reason anyone may
choose, and gone from the settings API."""

from importlib import import_module

from django.apps import apps

from services.work import sources
from services.work.models import LIVE_KINDS, RETIRED_KINDS, Recommendation
from services.work.recommend import refresh
from services.work.tests.feed_fixtures import FeedFixture

SETTINGS = "/api/v1/work/settings/"


class RetiredKindsTests(FeedFixture):
    def test_only_the_live_kinds_have_a_source(self):
        self.assertEqual(tuple(sources.SOURCES), LIVE_KINDS)
        self.assertFalse(set(RETIRED_KINDS) & set(sources.SOURCES))

    def test_a_refresh_makes_none_of_the_retired_kinds(self):
        self.due(self.csm, self.pizza, due_in=-10)
        self.question(self.csm, customer=self.pizza)
        self.proposal(self.pizza)
        result = refresh(self.org, today=self.today)
        self.assertEqual(result.failed, [])
        self.assertFalse(Recommendation.objects.filter(kind__in=RETIRED_KINDS).exists())

    def test_the_migration_closes_open_retired_ones_and_keeps_the_rest(self):
        open_retired = [
            self.suggestion(self.csm, self.pizza, kind=kind)
            for kind in ("overdue_tasks", "open_questions")
        ]
        live = self.suggestion(self.csm, self.dough)
        assigned = self.suggestion(self.mona, self.soup, kind="overdue_tasks")
        Recommendation.objects.filter(pk=assigned.pk).update(status="assigned")
        migration = import_module("services.work.migrations.0006_retire_recommendation_kinds")
        migration.close_retired(apps, None)
        for rec in open_retired:
            rec.refresh_from_db()
            self.assertEqual(
                (rec.status, rec.dismiss_reason, rec.decided_by_id), ("dismissed", "retired", None)
            )
            self.assertIsNotNone(rec.decided_at)
        live.refresh_from_db()
        assigned.refresh_from_db()
        self.assertEqual((live.status, assigned.status), ("open", "assigned"))

    def test_deciding_a_retired_one_is_already_decided(self):
        rec = self.suggestion(self.csm, self.pizza, kind="overdue_tasks")
        Recommendation.objects.filter(pk=rec.pk).update(
            status="dismissed", dismiss_reason="retired"
        )
        response = self.as_user(self.csm).post(
            f"/api/v1/work/recommendations/{rec.pk}/dismiss/",
            {"reason": "not_relevant"},
            format="json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "This recommendation was already dismissed.")
        self.assertEqual(response.json()["recommendation"]["dismiss_reason"], "retired")

    def test_nobody_may_choose_retired_as_a_reason(self):
        rec = self.suggestion(self.csm, self.pizza)
        response = self.as_user(self.csm).post(
            f"/api/v1/work/recommendations/{rec.pk}/dismiss/", {"reason": "retired"}, format="json"
        )
        self.assertEqual(
            (response.status_code, response.json()),
            (400, {"reason": ["Choose already handled, not relevant, wrong person or other."]}),
        )

    def test_the_settings_api_lists_the_live_sources_only(self):
        body = self.as_user(self.admin).get(SETTINGS).json()
        self.assertEqual(sorted(body["sources"]), sorted(LIVE_KINDS))
        for kind in ("overdue_tasks", "open_questions", "agent"):
            response = self.as_user(self.admin).patch(
                SETTINGS, {"sources": {kind: {"enabled": False}}}, format="json"
            )
            self.assertEqual(
                (response.status_code, response.json()),
                (400, {"sources": {kind: ["Unknown source."]}}),
                kind,
            )

    def test_running_an_agent_no_longer_refreshes_recommendations(self):
        import inspect

        from services.agents import views as agent_views

        # Run now itself calls a model, so the check reads the view's code.
        self.assertNotIn("recommend", inspect.getsource(agent_views.AgentRunView))
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.work.tests.test_retired_kinds --parallel auto --noinput`
Expected: FAIL (`cannot import name 'LIVE_KINDS'`).

- [ ] **Step 3: The model and the migration**

In `services/work/models.py`:
- delete the `"overdue_tasks"`, `"open_questions"` and `"agent"` entries from `DEFAULT_SOURCES`;
- add `RETIRED = "retired", "Retired"` as the last `DismissReason` member, with the comment `# Set only by the delivery 2 migration; never chosen by a person.`;
- after the class, add

```python
#: Kinds Revenact still recommends (Work in one place, delivery 2 §2).
LIVE_KINDS = ("renewal_due", "health_drop", "urgent_tickets", "anomaly")
#: Kinds kept only for history: an overdue task, a question and an agent
#: action are on Work as themselves, so their recommendations were retired.
RETIRED_KINDS = ("overdue_tasks", "open_questions", "agent_action")
```

- keep every `Kind` value and the `agent_action` FK and constraints (history rows).

Generate: `venv/bin/python manage.py makemigrations work --name retire_recommendation_kinds` (one `AlterField` on `dismiss_reason`'s choices). Then add the data step to the generated file:

```python
from django.db import migrations, models
from django.utils import timezone

RETIRED = ("overdue_tasks", "open_questions", "agent_action")


def close_retired(apps, schema_editor):
    """Every open recommendation of a retired kind: dismissed as retired, by nobody."""
    Recommendation = apps.get_model("work", "Recommendation")
    Recommendation.objects.filter(status="open", kind__in=RETIRED).update(
        status="dismissed", dismiss_reason="retired", decided_at=timezone.now(), decided_by=None
    )
```

and append `migrations.RunPython(close_retired, migrations.RunPython.noop)` after the generated `AlterField` in `operations` (keep the generated `dependencies` and `AlterField` exactly as made).

- [ ] **Step 4: Stop producing them**

- `services/work/sources.py`: delete `overdue_tasks`, `open_questions` and `agent_action` and their three `SOURCES` entries; update the module docstring's "an `agent` recommendation's title is the AI agent's task title, and the one-item notice quotes it" sentence to describe only Revenact's own titles. Remove imports the deletions leave unused (`ruff check` lists them). `Signal.agent_action` stays until Task 10.
- `services/work/recommend.py`: import `LIVE_KINDS` from `.models`; in `refresh`, `for kind in kinds or LIVE_KINDS:`; delete `SOURCE_KEYS` and `source_key`, and read `params[kind]` directly (`key = kind`).
- `services/work/routing.py`: drop `K.OPEN_QUESTIONS: CS` from `FUNCTION_FOR`, and "questions" from the module docstring's list.
- `services/work/defaults.py`: drop the `OVERDUE_TASKS` and `OPEN_QUESTIONS` entries from `PRIORITY`.
- `services/work/views.py`: add

```python
#: The reasons a person may choose; `retired` is the delivery 2 migration's own.
CHOOSABLE_REASONS = [
    (value, label)
    for value, label in Recommendation.DismissReason.choices
    if value != Recommendation.DismissReason.RETIRED
]
```

and use `choices=CHOOSABLE_REASONS` in `DismissSerializer.reason`.
- `services/agents/views.py` `AgentRunView.post`: delete the `try: recommend.refresh(...) except ...` block and the now-unused local imports `from services.work import recommend` and `from services.work.models import Recommendation` (keep `today_for`). Its docstring loses any mention of Recommended.

- [ ] **Step 5: Bring the existing tests in line**

Rule for every hit below: **delete** a test (or a subTest row) that asserts a retired kind is produced, routed, prefilled, switched or refreshed; **keep** a test that creates a retired-kind row directly to prove it is excluded or read correctly (`test_feed_suggest.py`, `test_feed_api.py`, `test_clock.py`'s `make_rec("overdue_tasks", ...)` row may switch to `"renewal_due"` if its assertion needs an open, decidable row); **adapt** a settings test that enumerates sources to the four live ones.

Run `grep -rln "overdue_tasks\|open_questions\|\"agent\"\|only(\"agent\")\|K.AGENT_ACTION\|Kind.AGENT_ACTION" services e2e --include='test_*.py'` and work through, at least:
- `services/work/tests/test_sources_work.py`: delete the overdue-tasks and open-questions source tests.
- `services/work/tests/test_refresh.py`: delete the `self.only("agent")` tests (~155–210); keep `worse(...)` checks (they test a pure function of any kind string).
- `services/work/tests/test_settings_api.py`: the sources payloads and refusals use live kinds only; the `{"sources": {"agent": True}}` refusal row becomes `{"sources": {"agent": True}}` → `{"sources": {"agent": ["Unknown source."]}}`.
- `services/work/tests/test_recommend_models.py`: the `DEFAULT_SOURCES` equality (~76) lists the four live kinds.
- `services/work/tests/test_routing.py`: drop `"open_questions"` from the function-owner loop (~64) and delete the overdue-tasks route test (~70). (Agent routing tests go in Task 10.)
- `services/work/tests/test_recommendations_api.py`: the defaults table (~275) drops the two retired kinds.
- `services/work/tests/test_queries.py`: the kinds it refreshes (~129) are `LIVE_KINDS`; delete the `Recommendation.objects.get(kind="agent_action")` part (~116).
- `services/agents/tests/test_recommended.py`: delete every test that runs `self.only("agent")` (they produce agent recommendations); Task 10 deletes the file if nothing is left.

- [ ] **Step 6: Run the suites**

Run: `venv/bin/python manage.py test services.work services.agents e2e.test_work_recommended_flow --parallel auto --noinput && venv/bin/python manage.py makemigrations --check --dry-run`
Expected: PASS and `No changes detected`.

- [ ] **Step 7: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/work/models.py services/work/migrations/0006_retire_recommendation_kinds.py services/work/sources.py services/work/recommend.py services/work/routing.py services/work/defaults.py services/work/views.py services/agents/views.py services/work/tests/test_retired_kinds.py
git add -u services/work/tests services/agents/tests
git commit -m "feat(work)!: retire the overdue-tasks, open-questions and agent-action recommendations

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(`git add -u` stages only modifications and deletions of tracked test files under those two folders; check `git status` shows nothing else staged.)

---

### Task 10: Delete the Recommendation ↔ AgentAction cross-settlement

**Files:**
- Modify: `services/work/recommend.py` (delete `settle_for_action`; `held_back`, `_key`, `last_decisions`, `waiting_message` lose their agent branches; `ONE_OPEN` keeps all three constraint names, since the constraints stay)
- Modify: `services/work/sources.py` (`Signal.agent_action` and its `key` branch deleted)
- Modify: `services/work/routing.py` (agent branches in `candidates`, `reads_source`, `route` deleted; `DRAFT_REPLY`, `PROPOSED` and the `may_read_source`/`unreadable_draft_ids` imports go if unused; the docstring's "A draft reply" and "for an agent's task.create" paragraphs go)
- Modify: `services/work/deciding.py` (`UseApply`, `_Lapsed`, `_agent_role`, `_settled`, the agent branches of `_locked`, `_assign` and `dismiss` deleted; module docstring's agent paragraph goes)
- Modify: `services/work/views.py` (the `except deciding.UseApply` branch deleted)
- Modify: `services/agents/deciding.py` (delete `_settle` and its three calls)
- Modify tests: listed in Step 4
- Create: `services/work/tests/test_no_settlement.py`

**Interfaces:**
- Produces: deciding a recommendation never touches an `AgentAction`; deciding an `AgentAction` never touches a `Recommendation`. `deciding.assign`/`dismiss` keep their signatures and return values.

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_no_settlement.py`:

```python
"""No cross-settlement (delivery 2 contract §2): an agent action decided
leaves any old recommendation row as it was, and the settlement code is
gone."""

from services.work import deciding, recommend
from services.work.models import Recommendation
from services.work.tests.feed_fixtures import FeedFixture


class NoSettlementTests(FeedFixture):
    def test_the_settlement_code_is_gone(self):
        self.assertFalse(hasattr(recommend, "settle_for_action"))
        self.assertFalse(hasattr(deciding, "UseApply"))
        from services.agents import deciding as agents_deciding

        self.assertFalse(hasattr(agents_deciding, "_settle"))

    def test_approving_an_action_leaves_a_history_row_alone(self):
        action = self.proposal(self.pizza)
        rec = Recommendation.objects.create(
            organisation=self.org,
            customer=self.pizza,
            kind="agent_action",
            title="Save play",
            agent_action=action,
            recipient=self.csm,
            status=Recommendation.Status.DISMISSED,
            dismiss_reason="retired",
        )
        response = self.as_user(self.csm).post(
            f"/api/v1/agents/actions/{action.pk}/approve/", {}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        rec.refresh_from_db()
        self.assertEqual(
            (rec.status, rec.dismiss_reason, rec.task_id), ("dismissed", "retired", None)
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.work.tests.test_no_settlement --parallel auto --noinput`
Expected: FAIL on `test_the_settlement_code_is_gone`.

- [ ] **Step 3: Delete the settlement paths**

Make the edits listed under **Files**. After them:
- `deciding.assign` reads: lock (`_locked` without the agent-action pre-lock), `if rec.status == S.OPEN: role = _role(reader, rec); return _assign(...), role`, else `raise AlreadyDecided(rec)`; `_assign` keeps only the `add_task(...)` path.
- `deciding.dismiss` keeps the status, reason, note and decider writes, without the `reject_locked` call.
- `recommend.held_back` starts `if last is None: return False`; `_key(rec)` returns `(rec.customer_id, rec.account_id)`; `last_decisions` drops `if s.agent_action is None` and the `agent_action__isnull=True` filter; `waiting_message` names a single recommendation when `can_open(recipient, recs[0].record)`.
- `sources.Signal.key` returns `(self.customer.pk, None if self.account is None else self.account.pk)`.
- `routing.Router.candidates` keeps only the function-owner and record-owner path; `qualifies` is `self.opens(user, signal.record)`; `route` loses the draft-reply check.

`grep -rn "agent_action" services/work --include='*.py' | grep -v tests` may still list `rec_access.py`, `recommendations.py` and `models.py`: those read history rows and keep the twice-filter on them (`rec_access.openable`'s `unreadable_draft_ids`), and stay.

- [ ] **Step 4: Bring the existing tests in line**

Delete the tests that exercise a removed path; keep the rest:
- `services/agents/tests/test_recommended.py`: delete the file if Task 9 left only settlement/Apply tests (`git rm`); otherwise delete those tests.
- `services/agents/tests/test_deciding.py` (~175–200): delete the tests asserting a recommendation is settled by an action's decision.
- `services/work/tests/test_deciding_race.py` (~103): delete the agent-action race test.
- `services/work/tests/test_recommendations_api.py`: delete tests that assign/dismiss an `agent_action` recommendation through its action or expect `USE_APPLY`; keep tests that list one (they read a history row; if a test needs it open, create it with `status="open"` directly).
- `services/work/tests/test_routing.py` (~130–145): delete the agent routing tests.
- `services/work/tests/test_recommend_models.py`: keep the constraint tests (the constraints stay).

- [ ] **Step 5: Run the suites**

Run: `venv/bin/python manage.py test services.work services.agents services.metrics services.brain --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/work/recommend.py services/work/sources.py services/work/routing.py services/work/deciding.py services/work/views.py services/agents/deciding.py services/work/tests/test_no_settlement.py
git add -u services/work/tests services/agents/tests
git commit -m "refactor(work)!: delete the recommendation and agent action cross-settlement

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The end-to-end journey

**Files:**
- Create: `e2e/test_work_one_place_team_flow.py`

- [ ] **Step 1: Write the journey**

```python
"""End-to-end tier: real server, real HTTP, real test DB.

Carl works for Mona. An agent proposes work on Carl's Pizza Hut, a task of
his is overdue and he has a private to-do. Mona's Team queue shows the
proposal and the task for Carl, never the to-do; she approves the proposal
from the queue; it leaves her queue and Carl's badge drops. Alice (view-all)
reads Company; Carl may not read Team at all. The old routes are gone."""

from datetime import timedelta
from decimal import Decimal

from django.test import LiveServerTestCase
from django.utils import timezone

from e2e.http import http_get, http_post
from services.accounts.models import User
from services.billing.models import BillingAccount
from services.customers.models import Customer, Task
from services.work.tests.recommend_fixtures import task_proposal


class WorkTeamQueueFlowTests(LiveServerTestCase):
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
        User.objects.filter(pk=carl.pk).update(reports_to=mona)
        pizza = Customer.objects.create(
            organisation=carl.organisation,
            name="Pizza Hut",
            owner=carl,
            arr_billed_at_account=Decimal(300_000),
        )
        tokens = {who: self.login(f"{who}@acme.io") for who in ("mona", "carl")}
        today = timezone.localdate()

        # 2. Carl's private to-do, an overdue task, and a proposal on Pizza Hut.
        status, made = http_post(
            self.api("/work/todos/"),
            {"title": "Renew my passport", "due_date": (today - timedelta(days=2)).isoformat()},
            token=tokens["carl"],
        )
        self.assertEqual(status, 201, made)
        late = Task.objects.create(
            customer=pizza,
            title="Chase the sponsor",
            assignee=carl,
            assignee_name=carl.name,
            created_by=carl,
            due_date=today - timedelta(days=1),
            priority="high",
        )
        action = task_proposal(carl.organisation, pizza)
        status, count = http_get(self.api("/work/feed/count/"), token=tokens["carl"])
        self.assertEqual((count["decide"], count["overdue"]), (1, 2))

        # 3. Mona's queue: the proposal and the task, for Carl; never the to-do.
        status, body = http_get(self.api("/work/feed/team/"), token=tokens["mona"])
        self.assertEqual((status, body["scope"], body["hidden"]), (200, "team", 0))
        (approval,) = self.group(body, "decide")["items"]
        self.assertEqual((approval["id"], approval["actions"]), (action.pk, ["approve", "reject"]))
        self.assertEqual(approval["for"], {"id": carl.pk, "name": "Carl CSM"})
        (task,) = self.group(body, "overdue")["items"]
        self.assertEqual((task["id"], task["actions"]), (late.pk, ["open"]))
        self.assertNotIn("Renew my passport", str(body))

        # 4. Mona approves from the queue: it leaves, and Carl's badge drops.
        status, decided = http_post(
            self.api(f"/agents/actions/{action.pk}/approve/"), {}, token=tokens["mona"]
        )
        self.assertEqual((status, decided["action"]["status"]), (200, "applied"))
        status, body = http_get(self.api("/work/feed/team/?scope=team"), token=tokens["mona"])
        self.assertEqual(self.group(body, "decide")["items"], [])
        status, count = http_get(self.api("/work/feed/count/"), token=tokens["carl"])
        self.assertEqual(count["decide"], 0)

        # 5. Alice reads Company; Carl may not read Team; Mona may not read Company.
        status, body = http_get(self.api("/work/feed/team/"), token=alice)
        self.assertEqual((status, body["scope"]), (200, "company"))
        self.assertIn(late.pk, [i["id"] for i in self.group(body, "overdue")["items"]])
        status, body = http_get(self.api("/work/feed/team/"), token=tokens["carl"])
        self.assertEqual((status, body["code"]), (403, "SCOPE_NOT_ALLOWED"))
        status, body = http_get(self.api("/work/feed/team/?scope=company"), token=tokens["mona"])
        self.assertEqual(status, 403)

        # 6. The removed routes.
        for path in ("/work/today/", "/brain/waiting/?scope=me", "/brain/waiting/count/"):
            status, _ = http_get(self.api(path), token=tokens["carl"])
            self.assertEqual(status, 404, path)
```

- [ ] **Step 2: Run it**

Run: `venv/bin/python manage.py test e2e.test_work_one_place_team_flow --noinput`
Expected: PASS. (If `http_get` returns a non-JSON body for a 404, compare only `status` there, as written.)

- [ ] **Step 3: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add e2e/test_work_one_place_team_flow.py
git commit -m "test(e2e): the Team queue journey and the removed routes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Docs, the full suite and the local database

**Files:**
- Modify: `docs/API_CONTRACTS.md` (the `work` section; the `brain` section's Waiting routes; the `agents` Run-now text; the notifications link list if it has one)
- Modify: `docs/product/01-prd.md`, `docs/product/02-trd.md`, `docs/product/05-backend-schema.md`, `docs/product/06-implementation-plan.md` (the four backend product docs)
- Modify: `docs/data-classification.md` (the `work.Recommendation` row), `.soc2/CONTROL_MAP.md` (AUTH-02 row)

- [ ] **Step 1: `docs/API_CONTRACTS.md`**

1. Rename the `work` section heading to ``## `work` — Work (My work's feed, `/work/team`, the Team queue, the task panel)``.
2. Delete the `GET /work/today/` subsection; where the text points readers to it, point to `GET /work/feed/`.
3. Append `### Work in one place, delivery 2 (2026-10-12)` to the `work` section: the D2 contract's "Decisions narrowing the spec" table and §1–§4, copied verbatim with each heading demoted one level; in the copied §1.7 replace "measured on the branch and pinned for both scopes" with the two numbers measured in Task 5.
4. In the Recommended subsections: the source list and `GET /work/settings/` `sources` are the four live kinds; add "`overdue_tasks`, `open_questions` and `agent_action` were retired in Work in one place, delivery 2: no longer made; open ones were dismissed with reason `retired`." Delete the `USE_APPLY` refusal and every sentence about a recommendation settling an agent action (or the reverse).
5. In the `brain` section delete `GET /brain/waiting/` and `GET /brain/waiting/count/`, leaving one line: "Removed in Work in one place, delivery 2: see `GET /work/feed/` (the reader's own) and `GET /work/feed/team/` (team and company)."
6. In the `agents` section's `POST /agents/<kind>/run/`, delete the sentence saying it refreshes Recommended.
7. Wherever notification links are listed, use the contract's §4 table.
8. Add the contract's §4.1 (the AI proposal notice) to the `work` section's delivery 2 text, with `PROPOSAL_NOTICE_CEILING`'s measured number; in the `agents` Run-now text say it sends that notice. Name `agent_proposal_waiting` wherever notification kinds are listed (including `Notification`'s row in `docs/product/05-backend-schema.md`).

- [ ] **Step 2: The product docs and the controls**

- `docs/product/01-prd.md`, Work: "Work › Team shows what waits on your team (My team, or Company for view-all and Leadership): decisions, overdue tasks and suggestions for the people below you, with the actions today's rules allow, and Ask the agent (Company, view-all). Brain › Waiting on you, Work › Today and the overdue-task, open-question and agent-action recommendations are gone: each of those things shows on Work as itself."
- `docs/product/02-trd.md`, `services/work/` row, append: "Delivery 2 (2026-10-12): `feed_team.py` serves `GET /work/feed/team/` from `feed_team_decide` (Brain's desk at the scope minus the reader's Me desk), `feed_team_tasks` (overdue tasks with a record, read-only) and `feed_team_suggest` (recommendations the reader may decide, recipient in scope), with `team_scope.resolve_team`; one savepoint per source, the feed's cursors. `today.py` and Brain's Waiting routes are gone; `brain.waiting.build` stays only for Ask Revenact's grounding. The recommender makes the four live kinds only; no code settles a recommendation from an agent action or the reverse."
- `docs/product/05-backend-schema.md`, `Recommendation` row: append "`dismiss_reason` may be `retired` (set only by `work.0006_retire_recommendation_kinds`, which dismissed every open `overdue_tasks`, `open_questions` and `agent_action` row); those three kinds are no longer made."
- `docs/product/06-implementation-plan.md`: after the delivery 1 line add "Work in one place, delivery 2 (2026-10-12, backend): the Team queue (`GET /work/feed/team/`), the three retired recommendation kinds, links into My work, and the removal of `/work/today/` and `/brain/waiting/*`."
- `docs/data-classification.md`, `work.Recommendation` row: append "Kinds `overdue_tasks`, `open_questions`, `agent_action` are history only (retired in Work in one place, delivery 2)."
- `.soc2/CONTROL_MAP.md` AUTH-02 evidence cell: rewrite the clause this branch's delivery 1 inserted so it reads in order, and add the queue: "...`visible_tasks` (creator or assignee + chains), applied in the list endpoints, Copilot retrieval and `_reply_readable_by`; to-dos (no record) creator-only through `services/customers/task_access.py:readable_tasks`, never through `visible_tasks`; My work's feed and the Team queue reuse every source's rule (`services/work/feed_*.py`, scope by `services/work/team_scope.py:resolve_team`), never listing or counting a to-do or a draft in the queue; ..." (this closes delivery 1's deferred minor that the inserted clause read oddly).

- [ ] **Step 3: Check the schema shows the route**

Run: `venv/bin/python manage.py shell -c "from django.test import Client; from services.accounts.models import User; c = Client(); c.force_login(User.objects.filter(is_active=True).first()); r = c.get('/api/schema/'); print(r.status_code, b'/api/v1/work/feed/team/' in r.content, b'/api/v1/work/today/' in r.content)"`
Expected: `200 True False`. (Anonymous `/api/schema/` fails on a bug outside this branch, `customers/serializers.py:722`; it stays deferred.)

- [ ] **Step 4: Lint, migrations, the full suite**

Run: `venv/bin/ruff check . && venv/bin/ruff format --check . && venv/bin/python manage.py makemigrations --check --dry-run`
Expected: clean, `No changes detected`.

Run: `venv/bin/python manage.py test --parallel auto --noinput`
Expected: `OK`. A failure in a test this plan did not touch means an existing reader changed: find it with `systematic-debugging`; never loosen the test.

- [ ] **Step 5: Migrate the local dev database**

Run: `venv/bin/python manage.py migrate --noinput`
Expected: `Applying work.0006_retire_recommendation_kinds... OK`.

- [ ] **Step 6: Commit**

```bash
git add docs/API_CONTRACTS.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md docs/product/06-implementation-plan.md docs/data-classification.md .soc2/CONTROL_MAP.md
git commit -m "docs: Work in one place delivery 2 (Team queue, retired kinds, removed routes)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: The once-a-day AI proposal notice (owner decision on Q1)

**Order:** run this task after Task 10 and before Task 11 (it needs Task 9's Run-now change; Task 12 documents it).

**Contract:** D2 contract D11, D12 and §4.1. Read §4.1 first: it is the binding rule.

**Files:**
- Modify: `services/notifications/models.py` (`Kind.AGENT_PROPOSAL_WAITING = "agent_proposal_waiting", "AI proposal waiting"`; the class docstring names it)
- Create: `services/notifications/migrations/0013_agent_proposal_waiting.py` (generated by `makemigrations notifications -n agent_proposal_waiting`; choices only)
- Create: `services/work/proposal_notice.py`
- Modify: `services/work/recommend.py` (`refresh` calls `notify_proposals` after `notify_waiting`, in its own try/except that logs `type(exc).__name__` like the one above it; `RefreshResult` unchanged)
- Modify: `services/agents/views.py` (`AgentRunView.post`: where Task 9 removed the recommender call, call `proposal_notice.notify_proposals(organisation, today=today, actor=user)` in a try/except that logs and never fails the run)
- Create: `services/work/tests/test_proposal_notice.py`

**Interfaces:**
- Produces: `proposal_notice.KIND`, `PROPOSALS_LINK = "/work/mine?kind=approval"`, `MESSAGE = "AI proposals are waiting for your decision."`, `notify_proposals(organisation, *, today, now=None, actor=None) -> int` (how many were told), `candidates(organisation, since) -> set[int]`.
- Consumes: `services.work.feed_decide.Approvals` (the feed's own approvals source: the visibility rule), `services.agents.deciding.may_decide` and `WAIT`, `services.work.standing.working_ids`, `services.work.clock.start_of_day`, `services.notifications.realtime.notify` (`push_on_commit=True`, as `notify_waiting`).

- [ ] **Step 1: Write the failing tests** (`services/work/tests/test_proposal_notice.py`, on `FeedFixture`; read `feed_fixtures.py` and `test_feed_decide.py` for how proposed agent actions, records, chains, sessions and view-all readers are made)

1. The owner of a record with a fresh proposed action is told once: kind `agent_proposal_waiting`, link `/work/mine?kind=approval`, message exactly `MESSAGE`, actor `None`; `notify_proposals` returns 1.
2. Twice in one workspace day: the second call tells nobody (returns 0), even with a new proposal made in between.
3. Next day (pass `today` + 1 and a `now` past that day's start): with no proposal made since the last notice, nobody is told; with one new proposal, the owner is told again.
4. Not told: the owner's manager (decides only from Team), a view-all reader who does not own the record, a session participant who sees the proposal but may not decide it, a suspended owner (not in `working_ids`), the `actor`; a workspace-level proposal with no session tells nobody; a proposal that is not `proposed`, or older than `WAIT`, tells nobody.
5. Told: a present session participant who sees the conversation whole and may decide the facilitator's proposal (e.g. the record's owner's manager invited into the session) — only if the fixtures already build sessions; otherwise assert the owner case through a session-made proposal.
6. One person per workspace: two workspaces' owners are each told about their own workspace's proposals only.
7. `PROPOSAL_NOTICE_CEILING`: with three owners each holding one proposal, count queries of `notify_proposals`; add five more proposals per owner (fresh notices cleared) and assert the count is unchanged and `<= PROPOSAL_NOTICE_CEILING` (measure, then pin, as Task 5 Step 6). Assert no captured query contains `DISTINCT`.
8. Wiring: `recommend.refresh` and `POST /agents/<kind>/run/` call `notify_proposals` (patch it with `mock.patch("services.work.proposal_notice.notify_proposals")` and assert the call and its `actor`); when it raises, `refresh` still returns its result and the run still answers 200.

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.work.tests.test_proposal_notice --parallel auto --noinput`
Expected: FAIL (`ModuleNotFoundError: No module named 'services.work.proposal_notice'`).

- [ ] **Step 3: The kind and its migration**

Add the `Kind` member after `MAIL_ACTION_FAILED`; run `venv/bin/python manage.py makemigrations notifications -n agent_proposal_waiting`.

- [ ] **Step 4: Write `services/work/proposal_notice.py`**

```python
"""The once-a-day "AI proposal waiting" notice (Work in one place,
delivery 2 contract §4.1; owner decision on Q1). AI agent proposals used to
reach the bell through their mirror recommendation's "recommendations
waiting" notice; that kind is retired, so this tells the people who could
decide a new proposal on their own My work, at most once a day each.

Visibility is the feed's own: a person is told only of proposals on their
My work's Approvals (`feed_decide.Approvals`) that they may decide
(`agents.deciding.may_decide`). The queries grow with the people who might
be told, never with the proposals."""

from django.utils import timezone

from services.accounts.models import User
from services.agents.deciding import WAIT, may_decide
from services.copilot.models import SessionParticipant
from services.metrics.models import AgentAction
from services.notifications.models import Notification

from .clock import start_of_day
from .feed_decide import Approvals
from .standing import working_ids

KIND = Notification.Kind.AGENT_PROPOSAL_WAITING
PROPOSALS_LINK = "/work/mine?kind=approval"
MESSAGE = "AI proposals are waiting for your decision."


def candidates(organisation, since):
    """Everyone a proposal made after `since` could sit on the My work of:
    its record's owner, and its session's owner and present participants.
    A superset: `notify_proposals` applies the exact rule to each."""
    proposed = AgentAction.objects.filter(
        organisation=organisation, status=AgentAction.Status.PROPOSED, created_at__gt=since
    )
    people = set()
    for customer_owner, account_owner, session_owner in proposed.values_list(
        "customer__owner_id", "account__owner_id", "session__conversation__user_id"
    ):
        people.update(pk for pk in (customer_owner, account_owner, session_owner) if pk)
    sessions = proposed.filter(session__isnull=False).values("session_id")
    people.update(
        SessionParticipant.objects.filter(
            session_id__in=sessions, left_at__isnull=True
        ).values_list("user_id", flat=True)
    )
    return people


def _last_told(user):
    return (
        Notification.objects.filter(recipient=user, kind=KIND)
        .order_by("-created_at")
        .values_list("created_at", flat=True)
        .first()
    )


def notify_proposals(organisation, *, today, now=None, actor=None):
    """Tell each person with a new proposal they may decide on their own
    My work, once per workspace day. Returns how many were told."""
    from services.notifications.realtime import notify

    now = now or timezone.now()
    floor = now - WAIT
    people = candidates(organisation, floor)
    if not people:
        return 0
    # SOC2:AUTH-02 a suspended or revoked member is not told of work
    people &= working_ids(organisation.pk)
    if actor is not None:
        people.discard(actor.pk)
    day = start_of_day(organisation, today)
    told = 0
    for user in User.objects.filter(pk__in=sorted(people)).order_by("pk"):
        last = _last_told(user)
        if last is not None and last >= day:
            continue
        since = floor if last is None else max(floor, last)
        # SOC2:AUTH-02 the feed's own rule: only proposals on the person's My
        # work that they may decide (twice-filtered: readable, then may_decide)
        waiting = (
            Approvals(user)
            .readable.filter(created_at__gt=since)
            .select_related(*Approvals.related)
            .order_by("created_at", "id")
        )
        if not any(may_decide(user, action) for action in waiting.iterator()):
            continue
        notify(
            recipient=user,
            actor=None,
            kind=KIND,
            message=MESSAGE,
            link=PROPOSALS_LINK,
            push_on_commit=True,
        )
        told += 1
    return told
```

Check before relying on it: `working_ids`'s argument (an organisation or its id: match `notify_waiting`), `Approvals.related` field names, `may_decide` reading `action.record` without extra queries for the select-related fields, and that the `values_list` paths exist (`session__conversation__user_id`). Adjust names to the code, not the code to the names. If `may_decide` queries per action for a person who may decide none of their many proposals (a non-deciding session participant), that cost grows with proposals: measure it in the ceiling test with such a participant and, if it grows, bound it (for example check only the participant's session proposals' first row per session) and record the choice in the report.

- [ ] **Step 5: Wire it in**

`recommend.refresh`: after the `notify_waiting` block,

```python
    try:
        proposal_notice.notify_proposals(organisation, today=today, now=now, actor=actor)
    except Exception as exc:  # noqa: BLE001 - the recommendations are made either way
        logger.warning(
            "work recommendations: the proposal notice failed for organisation %s: %s",
            organisation.pk,
            type(exc).__name__,
        )
```

(import `proposal_notice` lazily inside `refresh` or at module level, whichever avoids a cycle). `AgentRunView.post`: the same shape after the `agents.run` audit, `logger.warning("agents: the proposal notice after Run now failed: %s", type(exc).__name__)`.

- [ ] **Step 6: Run them to see them pass, plus the neighbours**

Run: `venv/bin/python manage.py test services.work services.agents services.notifications --parallel auto --noinput` and `venv/bin/python manage.py makemigrations --check --dry-run`.
Expected: PASS; `No changes detected`.

- [ ] **Step 7: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/notifications/models.py services/notifications/migrations/0013_agent_proposal_waiting.py services/work/proposal_notice.py services/work/recommend.py services/agents/views.py services/work/tests/test_proposal_notice.py
git commit -m "feat(work): a once-a-day AI proposal notice for the people who may decide

PROPOSAL_NOTICE_CEILING = <measured>

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Delivery 1 deferred minors

**Picked up here** (they sit in files this delivery changes):
- "has a record" Q written out four or five times → `task_access.on_record_q()` (Task 3).
- `is_todo` lacks a docstring (Task 3).
- `test_todo_privacy` prints an expected 404 warning → wrapped in `assertLogs` (Task 7).
- No same-timestamp tie-break test for the suggested keyset → `test_feed_team_suggest` (Task 4).
- `RuleReviews` non-owner branch untested (unreachable on the Me desk) → reachable and tested in the Team queue (Task 2).
- CONTROL_MAP AUTH-02 inserted clause reads oddly (Task 12).

**Still deferred:** migration test checks only the two-parent refusal; 0061 reverse fails with to-dos present; no constraint stops a to-do carrying a plan or initiative; no committed test for the `task.update` audit listing `record`; `Tasks()` IndexError when neither task nor todo is asked (callers guard); `hidden()` re-runs subqueries; `_attempt` logs only the exception class (deliberate: text may quote values); numeric title / out-of-range ids triage; no test paging a group while another group's source fails; `readable_tasks`'s `id IN | todo_q` shape; to-do history visible to the chain after attach (frontend warns); a deleted creator leaves an unreadable to-do; a JSON list body gives `non_field_errors` on `POST /work/todos/`; anonymous `/api/schema/` failure (`customers/serializers.py:722`, not this branch).

## Self-review (done while writing)

- **Spec coverage (§4.3, §4.4, §4.5, §8 item 2 backend):** Team queue with team/company scope, Brain's scope rules, suggestions included, `for`, allowed actions, 403s, no to-dos (Tasks 1–5); retire the three kinds: sources, settings toggles, data migration, cross-settlement (Tasks 9, 10); remove `/brain/waiting/*` (Task 8) and `/work/today/` (Task 7); bell links into Work (Task 6); docs (Task 12); testing §7: team and company access and 403s, no to-dos in the queue, retired kinds not produced, migration closes rows, ceilings pinned for the queue, one end-to-end journey (Tasks 1–11).
- **Placeholders:** the only measured value is `TEAM_CEILING`, with its exact procedure (Task 5 Step 6), as the spec asks ("ceiling set after measuring"); the commit body and Task 12 carry the numbers.
- **Names:** `resolve_team`, `TeamScopeUnknown`, `people`, `named` (Task 1) are used unchanged in Tasks 2–5; `MAKERS` (Task 2), `TeamOverdue(reader, scope, today)` (Task 3), `TeamSuggestions(reader, today, scope)` (Task 4) match `feed_team` (Task 5); `attempt`/`ordered` are renamed in Task 5 Step 3 before `feed_team` imports them; `LIVE_KINDS`, `RETIRED_KINDS`, `CHOOSABLE_REASONS`, `close_retired` (Task 9) match their tests; `SUGGESTED_LINK`, `REVIEWS_LINK` (Task 6).
