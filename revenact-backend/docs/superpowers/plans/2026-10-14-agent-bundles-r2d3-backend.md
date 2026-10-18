# Agent bundles, round 2 delivery 3 (backend): wider intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Slack message or Jira issue that matches no customer is kept (minimised, for 30 days) and listed as "Needs a customer" in its department's queue, where its department's people match it to a record (optionally adding the sender as a contact) or dismiss it; once matched it becomes a ticket and its thread is read like any other. Admins may switch on a rules-only fast lane that reads urgent threads after 2 quiet minutes on a 5-minute tick, capped at 10 calls an hour and 50 a day. Connector changes are audited (F2, F3) and, if the live checks pass, a Jira step can carry a JSM request type (F1).

**Architecture:** One new table, `connectors.UnmatchedItem`, owned by a new module `services/connectors/unmatched.py` (keep, list, match, dismiss, purge). The sync's `file_ticket` calls `unmatched.keep` where it used to drop an item, and deletes a waiting row when an item later matches by itself. Routes live in `services/work/unmatched_views.py` under `/work/unmatched/`; the rail (`services/work/queues.py`) adds one count per routed queue. The fast lane is `services/agents/fast_lane.py` (settings, validation, rules, caps); the sync's thread touches store the matching rule on `SignalThread.urgent_rule`, and `services/agents/intake.py` gains `run_fast`, which reuses `process` with `lane="fast"` (the model call carries `scope_key="fast_lane"`). `run_agent_signals` runs both lanes every 5 minutes.

**Tech Stack:** Python 3.13, Django 5.2, DRF 3.18, Postgres 16 (CI/prod; local may be 15), stdlib `urllib` for vendor calls (no SDKs). Tests: `django.test`, `rest_framework.test`, `LiveServerTestCase` + `e2e/http.py`.

**Spec:** react-ts-app `docs/superpowers/specs/2026-10-13-agent-bundles-design.md` §13 (items D and E as revised on the frontend branch `feat/agent-bundles-r2d3`). **Binding contract:** `docs/superpowers/plans/2026-10-14-agent-bundles-r2d3-api.md` (this repo). Read its "What R2-D2 left" and "Decisions narrowing the spec" (R2D3-1 to R2D3-24) before any task; every decision is a requirement here. The earlier contracts and their as-built record in `docs/API_CONTRACTS.md` still hold where R2-D3 does not change them.

## Global Constraints

- Work only in `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/r2d3-be` on branch `feat/agent-bundles-r2d3` (cut from main 29fe190: R2-D2 #118 and its live-test fixes #119 merged; its first commit holds this plan). Never merge, never open a PR, never touch the servers on ports 8000 or 5173 (the owner uses them).
- Python: make the venv link once, `ln -s ../gmail-be/venv venv` (the `venv/` ignore rule does not match a symlink: never `git add` it). Written `PY` below: `PY=venv/bin/python`. Ruff: `venv/bin/ruff`.
- `.env` points at the shared dev database `revenact`: **never migrate it, never write to it.** Tests use their own test database; read-only shell queries are fine.
- Run tests as `$PY manage.py test <labels> --parallel auto --noinput`. Never the whole suite serially (it passes the 30-minute mark).
- **Mac hang workaround:** a `--parallel auto` run sometimes stalls on the Metal lock (no new output, CPU idle). If a run shows **no progress for about 10 minutes**, kill it (`pkill -f "manage.py test"`) and run the same command again. A second stall on the same labels is a real hang: run those labels with `--parallel 1` to find the test.
- Lint before each commit: `venv/bin/ruff check . && venv/bin/ruff format --check .` (`ruff format` also formats Python blocks inside Markdown; run `venv/bin/ruff format .` if the check fails, docs included).
- Every commit message is a conventional commit (`commit-messages` skill) and ends with exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Stage explicit paths (`git add <paths>`, `git rm` for deletions); never `git add -A` or `git add .`. Never `git stash` (shared across worktrees).
- **CI is blocked by GitHub billing:** local checks are the gate. A task is done only when its tests pass locally; the last task runs the full suite (`--parallel auto`), `makemigrations --check`, `manage.py spectacular` and ruff.
- **Nothing real is ever sent.** Slack through `FakeSlackApi` (`use_slack`), Jira through `FakeJiraApi` (`use_jira`); no test opens a socket to Atlassian, Slack, Google or Microsoft; **no test calls a model** (`services.agents.intake.get_completion` and `services.customers.classification.get_completion` are always patched).
- **Postgres 16:** no visibility rule may be a join made unique with `DISTINCT`; use plain column filters or `id IN (subquery)`. Query counts are pinned (Task 13).
- Every visibility filter and gate carries `# SOC2:AUTH-02 ...`; every audited write `# SOC2:LOG-01`; the purge `# SOC2:DATA-04`. **Never** message text, a title or a requester's email in audit metadata or a log line (log the exception's class name only).
- **Twice-filter (spec §4.4):** an unmatched item never reaches a model (no `SignalThread` exists for it); the fast lane changes only when a thread is read.
- **Outside steps are always Ask** (D1 D21). **Scope (R2D3-1):** unmatched items from Slack and Jira only.
- User-facing sentences are exactly the contract's. No em dash in any sentence a person reads.
- No new dependency, no new env var. Migrations: `connectors.0006_unmatched_item`, `agents.0006_signal_thread_urgent`, `accounts.0017_organisation_fast_lane` (names may differ by `makemigrations`; keep its numbering).
- **Product documents rule:** `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md`, `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/data-classification.md`, `.soc2/CONTROL_MAP.md` and the flow doc `.agents/workflows/agent-intake-flow.md` (or the intake flow doc that exists: `ls .agents/workflows`) are updated in this PR (Task 15).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `services/connectors/views.py` | modify | F2, F3: `connector.update` / `create` / `delete` audit |
| `services/connectors/models.py`, `migrations/0006_unmatched_item.py` | modify/create | `UnmatchedItem` (contract §1.1) |
| `services/connectors/unmatched.py` | create | keep, list, match, dismiss, purge, counts |
| `services/connectors/sync.py` | modify | call `keep`; delete a waiting row when an item matches |
| `services/connectors/providers/jira.py` | modify | `extra["updated_at"]`; F1 request types and the Request Type field |
| `services/connectors/management/commands/sync_tickets.py` | modify | purge at the end of a full pass |
| `services/work/unmatched_views.py`, `services/work/urls.py` | create/modify | `/work/unmatched/` routes |
| `services/work/queues.py` | modify | `needs_customer` on each rail row |
| `services/accounts/models.py`, `migrations/0017_…` | modify/create | `ai_fast_lane`, `ai_fast_ran_at` |
| `services/agents/fast_lane.py` | create | settings, validation, rules, caps |
| `services/agents/settings_api.py` | modify | `signals.fast_lane` in GET; `fast_lane` in PATCH |
| `services/agents/models.py`, `migrations/0006_…` | modify/create | `SignalThread.urgent_rule` |
| `services/agents/threads.py` | modify | the touches store `urgent_rule` |
| `services/agents/intake.py` | modify | `lane`, `scope_key`, `run_fast` |
| `services/agents/management/commands/run_agent_signals.py`, `docker-compose.yml` | modify | `--lane`; every 5 minutes |
| `services/agents/actions/jira_issues.py`, `services/agents/outside/options.py`, `tools.py`, `sentences.py` | modify | F1 (conditional) |
| tests | create/modify | listed per task |
| `e2e/test_agent_round2_intake_flow.py` | create | the journey |
| docs | modify | Task 15 |

## Shared test fixtures (existing, extended here)

- `services/agents/tests/intake_fixtures.py` `IntakeFixture`: Carl (`csm`, CS, owns Pizza Hut whose domain is `pizzahut.com`), Mona (his manager), Dana (`other`), Alice (`admin`: admin, view-all), Lee (Leadership), Sam (Sales), Erin (Engineering), `connector(provider, department)`, `ticket_thread(record, connector=…)`, `message_bundle(thread, …)`, `MODEL` (the patch target), `QUIET_AGO`.
- `services/connectors/tests/jira_fake.py` `FakeJiraApi` (Task 3: `self.synced`, raw issues answered to a non-label `search/jql`; Task 12: `service_desks`, `request_types`, the create screen's Request Type field).
- `services/connectors/tests/slack_fake.py` `FakeSlackApi`: `channels["C0SUPPORT"]` messages, `users` profiles (check its field names: `grep -n "users" services/connectors/tests/slack_fake.py`).
- New `services/connectors/tests/unmatched_fixtures.py` (Task 2): `remote(**fields)` (a `RemoteTicket` from an unknown sender, now) and `item(connector, **fields)` (a stored waiting row).

---

### Task 1: F2, F3: connector changes are audited

**Files:**
- Modify: `services/connectors/views.py` (`ConnectorListCreateView.perform_create`, `ConnectorDetailView`)
- Test: `services/connectors/tests/test_connector_audit.py` (create)

**Interfaces:**
- Produces: `connector.update` (`changes`), `connector.create` (`provider`, `department`), `connector.delete` (`provider`, `tickets_kept`) (contract R2D3-22, §7).

- [ ] **Step 1: Write the failing tests**

Create `services/connectors/tests/test_connector_audit.py`:

```python
"""Round 2 D3 contract R2D3-22 (F2, F3): switching a connector on or off,
changing its department or companies, creating and deleting it are audited."""

from core.models import AuditEvent
from services.agents.tests.intake_fixtures import IntakeFixture


class ConnectorAuditTests(IntakeFixture):
    def test_switching_off_and_on_is_audited_with_what_changed(self):
        connector = self.connector("jira", "engineering")
        client = self.client_for(self.admin)
        self.assertEqual(
            client.patch(
                f"/api/v1/connectors/{connector.pk}/", {"is_enabled": False}, format="json"
            ).status_code,
            200,
        )
        row = AuditEvent.objects.get(action="connector.update")
        self.assertEqual(row.metadata["changes"], {"is_enabled": {"old": True, "new": False}})
        self.assertEqual(row.actor, self.admin)

    def test_a_patch_that_changes_nothing_writes_nothing(self):
        connector = self.connector("jira", "engineering")
        self.client_for(self.admin).patch(
            f"/api/v1/connectors/{connector.pk}/", {"department": "engineering"}, format="json"
        )
        self.assertFalse(AuditEvent.objects.filter(action="connector.update").exists())

    def test_companies_are_recorded_as_ids(self):
        connector = self.connector("slack", "cs")
        self.client_for(self.admin).patch(
            f"/api/v1/connectors/{connector.pk}/",
            {"customer_ids": [self.pizza.pk], "department": ""},
            format="json",
        )
        changes = AuditEvent.objects.get(action="connector.update").metadata["changes"]
        self.assertEqual(changes["customer_ids"], {"old": [], "new": [self.pizza.pk]})
        self.assertEqual(changes["department"], {"old": "cs", "new": ""})

    def test_create_and_delete_are_audited(self):
        client = self.client_for(self.admin)
        made = client.post(
            "/api/v1/connectors/",
            {"provider": "jira", "name": "Jira SUP", "department": "cs"},
            format="json",
        ).json()
        self.assertEqual(
            AuditEvent.objects.get(action="connector.create").metadata,
            {"provider": "jira", "department": "cs"},
        )
        self.assertEqual(client.delete(f"/api/v1/connectors/{made['id']}/").status_code, 204)
        self.assertEqual(
            AuditEvent.objects.get(action="connector.delete").metadata,
            {"provider": "jira", "tickets_kept": 0},
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.connectors.tests.test_connector_audit --parallel auto --noinput`
Expected: FAIL: `AuditEvent.DoesNotExist` in each.

- [ ] **Step 3: The audit**

In `services/connectors/views.py`:

```python
#: What `connector.update` records (contract R2D3-22): settings, never config or secrets.
AUDITED = ("name", "is_enabled", "department")


def _snapshot(connector):
    return {
        **{name: getattr(connector, name) for name in AUDITED},
        "customer_ids": sorted(connector.customers.values_list("id", flat=True)),
        "account_ids": sorted(connector.accounts.values_list("id", flat=True)),
    }
```

`ConnectorListCreateView.perform_create`:

```python
    def perform_create(self, serializer):
        connector = serializer.save(organisation=self.request.user.organisation)
        audit.record(  # SOC2:LOG-01 a ticket source was added (R2D3-22)
            "connector.create",
            request=self.request,
            organisation=connector.organisation,
            target=connector,
            metadata={"provider": connector.provider, "department": connector.department},
        )
```

`ConnectorDetailView` gains:

```python
def perform_update(self, serializer):
    before = _snapshot(serializer.instance)
    connector = serializer.save()
    after = _snapshot(connector)
    changes = {k: {"old": before[k], "new": after[k]} for k in after if before[k] != after[k]}
    if changes:
        audit.record(  # SOC2:LOG-01 who switched or re-scoped a ticket source (F2)
            "connector.update",
            request=self.request,
            organisation=connector.organisation,
            target=connector,
            metadata={"changes": changes},
        )


def perform_destroy(self, instance):
    kept = instance.tickets.count()
    audit.record(  # SOC2:LOG-01 a ticket source was removed; its tickets stay (F3)
        "connector.delete",
        request=self.request,
        organisation=instance.organisation,
        target=instance,
        metadata={"provider": instance.provider, "tickets_kept": kept},
    )
    instance.delete()
```

(The audit row is written before the delete so its target string is still readable; `AuditEvent`'s target is a string representation, not a foreign key: check `core/models.py` `AuditEvent` before relying on it.)

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.connectors --parallel auto --noinput`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/connectors/views.py services/connectors/tests/test_connector_audit.py
git commit -m "feat(connectors): audit switching, re-scoping, adding and removing a ticket source

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The unmatched table and what it keeps

**Files:**
- Modify: `services/connectors/models.py`
- Create: `services/connectors/migrations/0006_unmatched_item.py` (by `makemigrations`), `services/connectors/unmatched.py`, `services/connectors/tests/unmatched_fixtures.py`
- Test: `services/connectors/tests/test_unmatched_keep.py` (create)

**Interfaces:**
- Produces: `UnmatchedItem` (contract §1.1); `unmatched.keep(connector, remote, *, now=None)` (contract §2, R2D3-3, R2D3-5, R2D3-6); constants `EXCERPT_CHARS`, `KEEP_DAYS`, `FRESH`, `MAX_WAITING_PER_CONNECTOR`, `PAGE`.

- [ ] **Step 1: Write the failing tests**

Create `services/connectors/tests/unmatched_fixtures.py`:

```python
"""Round 2 D3 test helpers: a remote item from someone no customer knows,
and a stored waiting row."""

from django.utils import timezone

from services.connectors.models import UnmatchedItem
from services.connectors.providers.base import RemoteTicket

_n = iter(range(1, 100_000))


def remote(**fields):
    n = next(_n)
    values = {
        "external_id": f"SUP-{n}",
        "number": f"SUP-{n}",
        "title": "Export fails",
        "description": "Nobody can export since this morning.",
        "requester_email": "ann@newco.io",
        "requester_name": "Ann Lee",
        "url": f"https://acme.atlassian.net/browse/SUP-{n}",
        "opened_at": timezone.localdate(),
        "extra": {"updated_at": timezone.now().isoformat()},
    }
    values.update(fields)
    return RemoteTicket(**values)


def item(connector, **fields):
    n = next(_n)
    now = timezone.now()
    values = {
        "organisation": connector.organisation,
        "connector": connector,
        "provider": connector.provider,
        "department": connector.department,
        "external_id": f"X-{n}",
        "number": f"X-{n}",
        "title": "Export fails",
        "excerpt": "Nobody can export.",
        "requester_name": "Ann Lee",
        "requester_email": "ann@newco.io",
        "priority": "medium",
        "opened_on": timezone.localdate(),
        "first_seen_at": now,
        "last_seen_at": now,
    }
    values.update(fields)
    return UnmatchedItem.objects.create(**values)
```

Create `services/connectors/tests/test_unmatched_keep.py`:

```python
"""Round 2 D3 contract §2, R2D3-3, R2D3-5, R2D3-6: what an unmatched Slack
or Jira item keeps, and when it keeps nothing."""

from datetime import timedelta

from django.utils import timezone

from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors import unmatched
from services.connectors.models import UnmatchedItem
from services.connectors.tests.unmatched_fixtures import item, remote


class KeepTests(IntakeFixture):
    def setUp(self):
        self.jira = self.connector("jira", "cs")

    def test_an_item_is_kept_minimised(self):
        unmatched.keep(self.jira, remote(external_id="SUP-7", description="x" * 5000))
        row = UnmatchedItem.objects.get()
        self.assertEqual(
            (row.external_id, row.department, row.status, len(row.excerpt), row.requester_email),
            ("SUP-7", "cs", "waiting", unmatched.EXCERPT_CHARS, "ann@newco.io"),
        )

    def test_nothing_is_kept_for_other_providers(self):
        unmatched.keep(self.connector("zendesk", "cs"), remote())
        self.assertFalse(UnmatchedItem.objects.exists())

    def test_nothing_is_kept_when_agents_do_not_read_the_source(self):
        self.org.ai_signal_sources = {"jira": False}
        self.org.save(update_fields=["ai_signal_sources"])
        self.jira.refresh_from_db()
        unmatched.keep(self.jira, remote())
        self.assertFalse(UnmatchedItem.objects.exists())

    def test_nothing_is_kept_for_a_colleague_an_agents_issue_or_an_old_one(self):
        unmatched.keep(self.jira, remote(requester_email="dana@acme.io"))
        unmatched.keep(self.jira, remote(extra={"made_here": True}))
        old = (timezone.now() - timedelta(days=8)).isoformat()
        unmatched.keep(self.jira, remote(extra={"updated_at": old}))
        unmatched.keep(self.jira, remote(status="resolved"))
        self.assertFalse(UnmatchedItem.objects.exists())

    def test_seen_again_it_is_updated_and_resolved_it_goes(self):
        unmatched.keep(self.jira, remote(external_id="SUP-8", title="Old"))
        unmatched.keep(self.jira, remote(external_id="SUP-8", title="New"))
        self.assertEqual(UnmatchedItem.objects.get().title, "New")
        unmatched.keep(self.jira, remote(external_id="SUP-8", status="closed"))
        self.assertFalse(UnmatchedItem.objects.exists())

    def test_a_dismissed_item_is_never_listed_again(self):
        item(self.jira, external_id="SUP-9", status="dismissed", title="", excerpt="")
        unmatched.keep(self.jira, remote(external_id="SUP-9", title="Again"))
        row = UnmatchedItem.objects.get()
        self.assertEqual((row.status, row.title), ("dismissed", ""))

    def test_a_full_connector_keeps_no_more(self):
        for n in range(unmatched.MAX_WAITING_PER_CONNECTOR):
            item(self.jira, external_id=f"F-{n}")
        unmatched.keep(self.jira, remote(external_id="SUP-10"))
        self.assertFalse(UnmatchedItem.objects.filter(external_id="SUP-10").exists())
```

(`test_a_full_connector_keeps_no_more` creates 500 rows: fine in a test DB. If it is slow, patch `unmatched.MAX_WAITING_PER_CONNECTOR` to 3 with `patch.object`.)

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.connectors.tests.test_unmatched_keep --parallel auto --noinput`
Expected: FAIL: `ImportError: cannot import name 'UnmatchedItem'`.

- [ ] **Step 3: The model**

Append to `services/connectors/models.py`:

```python
class UnmatchedItem(models.Model):
    """A Slack message or Jira issue that matched no customer (agent bundles
    round 2 D3, contract §1.1, R2D3-2): kept minimised for its department's
    people to match or dismiss, deleted 30 days after it was last seen. No
    model reads it: it has no SignalThread until someone matches it."""

    class Status(models.TextChoices):
        WAITING = "waiting", "Waiting"
        DISMISSED = "dismissed", "Dismissed"

    organisation = models.ForeignKey(
        Organisation, related_name="unmatched_items", on_delete=models.CASCADE
    )
    connector = models.ForeignKey(
        Connector, related_name="unmatched_items", on_delete=models.CASCADE
    )
    provider = models.CharField(max_length=16)
    department = models.CharField(max_length=16, blank=True, default="")
    external_id = models.CharField(max_length=128)
    number = models.CharField(max_length=32)
    title = models.CharField(max_length=255, blank=True, default="")
    #: SOC2:DATA-06 at most 2,000 characters of the item's text (R2D3-3);
    #: blanked on dismiss, never logged, never audited.
    excerpt = models.TextField(blank=True, default="")
    requester_name = models.CharField(max_length=150, blank=True, default="")
    requester_email = models.CharField(max_length=254, blank=True, default="")
    url = models.CharField(max_length=500, blank=True, default="")
    priority = models.CharField(max_length=8, default="medium")
    opened_on = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.WAITING)
    first_seen_at = models.DateTimeField()
    last_seen_at = models.DateTimeField()
    dismissed_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    dismissed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["connector", "external_id"], name="unmatched_item_once")
        ]
        indexes = [
            models.Index(
                fields=["organisation", "department", "status", "last_seen_at"],
                name="unmatched_item_queue",
            )
        ]

    def __str__(self):
        # Never the text or the sender: an audit row may record this.
        return f"Unmatched item {self.pk}"
```

Run: `$PY manage.py makemigrations connectors` (expect `0006_unmatched_item.py`).

- [ ] **Step 4: `keep`**

Create `services/connectors/unmatched.py`:

```python
"""Slack and Jira items that match no customer (agent bundles round 2 D3,
contract §2, §3, R2D3-2 to R2D3-11): kept minimised in their own table,
listed in their department's queue, matched by hand or dismissed, and
deleted 30 days after they were last seen. No model ever reads one: no
SignalThread exists until a person matches it."""

from datetime import datetime, time, timedelta

from django.utils import timezone
from django.utils.dateparse import parse_datetime

from services.accounts.models import User
from services.customers.models import Ticket

from .models import Connector, UnmatchedItem

U = UnmatchedItem.Status
SOURCES = (Connector.Provider.SLACK, Connector.Provider.JIRA)
EXCERPT_CHARS = 2000
KEEP_DAYS = 30
#: D2-22's window: an item quiet for longer is not kept (Jira's first sync reads 90 days).
FRESH = timedelta(days=7)
MAX_WAITING_PER_CONNECTOR = 500
PAGE = 25


def _last_activity(remote):
    at = parse_datetime(str((remote.extra or {}).get("updated_at") or ""))
    if at is not None:
        return at
    if remote.opened_at is not None:
        return timezone.make_aware(datetime.combine(remote.opened_at, time.min))
    return timezone.now()


def _is_member(connector, email):
    return (
        bool(email)
        and User.objects.filter(
            organisation_id=connector.organisation_id, email__iexact=email
        ).exists()
    )


def _keepable(connector, remote, now):
    from services.agents.threads import source_on

    return (
        connector.is_enabled
        and connector.has_credentials
        and source_on(connector.organisation, connector.provider)
        and not (remote.extra or {}).get("made_here")
        and _last_activity(remote) >= now - FRESH
        and not _is_member(connector, remote.requester_email)
    )


def _text(remote):
    return {
        "number": (remote.number or remote.external_id)[:32],
        "title": (remote.title or "")[:255],
        "excerpt": (remote.description or "")[:EXCERPT_CHARS],
        "requester_name": (remote.requester_name or "")[:150],
        "requester_email": (remote.requester_email or "").lower()[:254],
        "url": (remote.url or "")[:500],
        "priority": remote.priority or "medium",
    }


def keep(connector, remote, *, now=None):
    """Contract §2: keep, update or drop one item that matched no customer."""
    if connector.provider not in SOURCES:
        return
    now = now or timezone.now()
    rows = UnmatchedItem.objects.filter(connector=connector, external_id=remote.external_id[:128])
    row = rows.first()
    if row is not None and row.status == U.DISMISSED:
        return  # R2D3-6: a dismissed item stays dismissed
    if remote.status in Ticket.RESOLVED_STATUSES:
        rows.delete()
        return
    if not _keepable(connector, remote, now):
        return
    text = _text(remote)
    if row is not None:
        for name, value in text.items():
            setattr(row, name, value)
        row.last_seen_at = now
        row.save(update_fields=[*text, "last_seen_at"])
        return
    waiting = UnmatchedItem.objects.filter(connector=connector, status=U.WAITING).count()
    if waiting >= MAX_WAITING_PER_CONNECTOR:
        return
    UnmatchedItem.objects.create(
        organisation_id=connector.organisation_id,
        connector=connector,
        provider=connector.provider,
        department=connector.department,
        external_id=remote.external_id[:128],
        opened_on=remote.opened_at or now.date(),
        first_seen_at=now,
        last_seen_at=now,
        **text,
    )


def forget(connector, external_id):
    """An item that now matches by itself (R2D3-6): its waiting row goes."""
    UnmatchedItem.objects.filter(connector=connector, external_id=external_id[:128]).delete()
```

- [ ] **Step 5: Run them to see them pass**

Run: `$PY manage.py test services.connectors.tests.test_unmatched_keep --parallel auto --noinput && $PY manage.py makemigrations --check --dry-run`
Expected: OK; "No changes detected".

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/connectors/models.py services/connectors/migrations/0006_unmatched_item.py services/connectors/unmatched.py services/connectors/tests/unmatched_fixtures.py services/connectors/tests/test_unmatched_keep.py
git commit -m "feat(connectors): keep Slack and Jira items that match no customer, minimised

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The sync keeps them, and forgets them when they match

**Files:**
- Modify: `services/connectors/sync.py` (`file_ticket`), `services/connectors/providers/jira.py` (`_ticket`), `services/connectors/tests/jira_fake.py`
- Test: `services/connectors/tests/test_unmatched_sync.py` (create)

**Interfaces:**
- Consumes: `unmatched.keep`, `unmatched.forget` (Task 2).
- Produces: `file_ticket` keeps an unmatched Slack/Jira item and still answers `"unmatched"`; a Ticket made for an item deletes its waiting row; Jira's `RemoteTicket.extra["updated_at"]`; `FakeJiraApi.synced` (raw issues a sync search returns).

- [ ] **Step 1: The fake answers a sync search**

In `FakeJiraApi.__init__` add `self.synced = []` (raw issues: `{"key": "SUP-31", "fields": {...}}`). In `_route`'s `search/jql` branch, before the label match:

```python
            if not label:
                # A sync's search (`updated >= ...`): the issues the test put here.
                return {"issues": list(self.synced), "isLast": True}
```

(Move the `label = re.fullmatch(...)` line above it.)

- [ ] **Step 2: Write the failing tests**

Create `services/connectors/tests/test_unmatched_sync.py`:

```python
"""Round 2 D3 contract §2, R2D3-6: a sync keeps an unmatched Slack or Jira
item, still counts it as unmatched, never classifies it, and forgets it when
the item later matches a customer."""

from unittest.mock import patch

from django.utils import timezone

from services.agents.models import SignalThread
from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors.models import UnmatchedItem
from services.connectors.sync import sync_connector
from services.connectors.tests.jira_fake import use_jira
from services.customers.models import Contact, Ticket


def issue(key, email, name="Ann Lee", summary="Export fails"):
    now = timezone.now().isoformat()
    return {
        "key": key,
        "fields": {
            "summary": summary,
            "status": {"statusCategory": {"key": "new"}},
            "priority": {"name": "Highest"},
            "reporter": {"emailAddress": email, "displayName": name},
            "created": now,
            "updated": now,
            "description": None,
            "labels": [],
        },
    }


@patch(
    "services.customers.classification.get_completion",
    side_effect=AssertionError("no model at sync"),
)
class UnmatchedSyncTests(IntakeFixture):
    def setUp(self):
        self.api = use_jira(self)
        self.jira = self.connector("jira", "cs")
        self.jira.config = {"host": "acme.atlassian.net", "project": "SUP"}
        self.jira.set_credentials({"email": "bot@acme.io", "api_token": "fake"})
        self.jira.save()

    def test_an_unknown_reporter_is_kept_counted_and_never_read(self, _model):
        self.api.synced = [issue("SUP-31", "ann@newco.io")]
        counts = sync_connector(self.jira)
        self.assertEqual(counts["unmatched"], 1)
        row = UnmatchedItem.objects.get()
        self.assertEqual((row.number, row.priority), ("SUP-31", "critical"))
        self.assertFalse(Ticket.objects.exists())
        self.assertFalse(SignalThread.objects.exists())

    def test_it_is_forgotten_once_the_reporter_matches(self, _model):
        self.api.synced = [issue("SUP-31", "ann@newco.io")]
        sync_connector(self.jira)
        Contact.objects.create(customer=self.pizza, name="Ann Lee", email="ann@newco.io")
        with patch("services.connectors.sync.classify_new"):
            sync_connector(self.jira)
        self.assertFalse(UnmatchedItem.objects.exists())
        self.assertEqual(Ticket.objects.get().customer, self.pizza)
```

(Check the Jira connector's config and credential keys against `services/connectors/providers/jira.py` `setup` / `_headers`: `grep -n "api_token\|\"email\"" services/connectors/providers/jira.py`.)

- [ ] **Step 3: Run them to see them fail**

Run: `$PY manage.py test services.connectors.tests.test_unmatched_sync --parallel auto --noinput`
Expected: FAIL: `UnmatchedItem.DoesNotExist`.

- [ ] **Step 4: The hook**

`services/connectors/providers/jira.py` `_ticket`: `extra` carries the update time:

```python
        extra = {"updated_at": f.get("updated") or ""}
        if made_here:
            extra["made_here"] = True
        return RemoteTicket(..., extra=extra)
```

(Check every reader of `extra` still works: `grep -rn "\.extra" services/connectors services/agents | grep -v tests`; only `made_here` is read.)

`services/connectors/sync.py` `file_ticket`:

```python
    customer, account = _parent_for(connector, remote)
    if customer is None and account is None:
        # Round 2 D3 (R2D3-2): Slack and Jira keep it for a person to match.
        unmatched.keep(connector, remote)
        return "unmatched", None
    ...
    ticket.save()
    # Matched by itself now (a contact was added meanwhile): its waiting row goes (R2D3-6).
    unmatched.forget(connector, remote.external_id)
```

with `from . import unmatched` at the top. The module docstring's "counted and skipped" sentence gains: "Slack and Jira also keep it, minimised, for a person to match (services/connectors/unmatched.py)."

- [ ] **Step 5: Run them to see them pass**

Run: `$PY manage.py test services.connectors services.agents.tests.test_intake_run e2e.test_agent_intake_flow --parallel auto --noinput`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/connectors/sync.py services/connectors/providers/jira.py services/connectors/tests/jira_fake.py services/connectors/tests/test_unmatched_sync.py
git commit -m "feat(connectors): the sync keeps unmatched Slack and Jira items and forgets them once matched

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Listing "Needs a customer"

**Files:**
- Modify: `services/connectors/unmatched.py`, `services/work/urls.py`
- Create: `services/work/unmatched_views.py`
- Test: `services/work/tests/test_unmatched_list.py` (create)

**Interfaces:**
- Produces: `unmatched.queue_of(row)`, `unmatched.waiting_in(reader, key)` (raises `NotAQueue` / `ScopeNotAllowed`), `unmatched.page(reader, key, cursor)`, `unmatched.count(reader, key)`; `GET /work/unmatched/` (contract §3.1).

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_unmatched_list.py`:

```python
"""Round 2 D3 contract §3.1, R2D3-7: a queue's unmatched items, for the
department's people and Leadership (Unassigned: admins), newest first, 25 a
page, the text and the sender included."""

from datetime import timedelta

from django.utils import timezone

from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors.tests.unmatched_fixtures import item

URL = "/api/v1/work/unmatched/"


class UnmatchedListTests(IntakeFixture):
    def setUp(self):
        self.cs = self.connector("jira", "cs")
        self.eng = self.connector("jira", "engineering")
        self.everyone = self.connector("slack", "")

    def get(self, user, query):
        return self.client_for(user).get(f"{URL}?{query}")

    def test_the_department_sees_its_own_items(self):
        mine = item(self.cs, title="Export fails")
        item(self.eng, title="Engineering's")
        body = self.get(self.csm, "queue=department:cs").json()
        self.assertEqual([row["id"] for row in body["items"]], [mine.pk])
        row = body["items"][0]
        self.assertEqual(row["from"], {"name": "Ann Lee", "email": "ann@newco.io"})
        self.assertEqual(row["connector"]["id"], self.cs.pk)
        self.assertTrue(row["can_add_contact"])
        self.assertEqual(body["count"], 1)

    def test_another_department_and_view_all_are_refused(self):
        item(self.eng)
        response = self.get(self.csm, "queue=department:engineering")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "SCOPE_NOT_ALLOWED")

    def test_leadership_reads_every_department_and_admins_unassigned(self):
        item(self.eng)
        item(self.everyone)
        self.assertEqual(self.get(self.lee, "queue=department:engineering").json()["count"], 1)
        self.assertEqual(self.get(self.admin, "queue=unassigned").json()["count"], 1)
        self.assertEqual(self.get(self.csm, "queue=unassigned").status_code, 403)

    def test_a_queue_that_is_not_a_routed_one_is_refused(self):
        response = self.get(self.csm, "queue=mine")
        self.assertEqual(
            response.json(),
            {"code": "SCOPE_UNKNOWN", "detail": "Choose a department or unassigned."},
        )

    def test_dismissed_rows_are_not_listed(self):
        item(self.cs, status="dismissed", title="", excerpt="")
        self.assertEqual(self.get(self.csm, "queue=department:cs").json()["items"], [])

    def test_pages_of_25_newest_first(self):
        now = timezone.now()
        for n in range(30):
            item(self.cs, last_seen_at=now - timedelta(minutes=n))
        first = self.get(self.csm, "queue=department:cs").json()
        self.assertEqual(len(first["items"]), 25)
        rest = self.get(self.csm, f"queue=department:cs&cursor={first['next']}").json()
        self.assertEqual((len(rest["items"]), rest["next"]), (5, None))
        stale = self.get(self.csm, f"queue=department:engineering&cursor={first['next']}")
        self.assertEqual(stale.status_code, 403)
        wrong = self.get(self.lee, f"queue=department:engineering&cursor={first['next']}")
        self.assertEqual(wrong.json(), {"cursor": ["That list has changed. Reload Work."]})

    def test_a_known_contact_cannot_be_added_again(self):
        from services.customers.models import Contact

        Contact.objects.create(customer=self.pizza, name="Ann", email="ANN@newco.io")
        item(self.cs)
        row = self.get(self.csm, "queue=department:cs").json()["items"][0]
        self.assertFalse(row["can_add_contact"])
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.work.tests.test_unmatched_list --parallel auto --noinput`
Expected: FAIL: 404 on the route.

- [ ] **Step 3: Reading**

Append to `services/connectors/unmatched.py`:

```python
import base64
import binascii
import json

from django.db.models import Q
from django.db.models.functions import Lower

from services.brain.scope import ScopeNotAllowed, ScopeUnknown

STALE_CURSOR = "That list has changed. Reload Work."


class NotAQueue(ScopeUnknown):
    detail = "Choose a department or unassigned."


class BadCursor(Exception):
    pass


def queue_of(row):
    from services.work.queue_bundles import DEPARTMENT, UNASSIGNED

    return UNASSIGNED if not row.department else f"{DEPARTMENT}{row.department}"


def waiting_in(reader, key):
    """The queue's waiting rows (R2D3-7), or NotAQueue / ScopeNotAllowed."""
    from services.work import queue_bundles

    if not queue_bundles.is_queue_key(key):
        raise NotAQueue(key)
    if key != queue_bundles.UNASSIGNED and queue_bundles.code_of(key) not in queue_bundles.LABELS:
        raise NotAQueue(key)
    # SOC2:AUTH-02 the queue's people only: its department and Leadership; Unassigned admins
    if not queue_bundles.may_use(reader, key):
        raise ScopeNotAllowed(key)
    department = "" if key == queue_bundles.UNASSIGNED else queue_bundles.code_of(key)
    return UnmatchedItem.objects.filter(
        organisation_id=reader.organisation_id, status=U.WAITING, department=department
    )


def count(reader, key):
    return waiting_in(reader, key).count()


def _encode(key, row):
    raw = json.dumps({"q": key, "t": row.last_seen_at.isoformat(), "i": row.pk})
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode(key, cursor):
    try:
        data = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        at = parse_datetime(data["t"])
        if data["q"] != key or at is None or not isinstance(data["i"], int):
            raise BadCursor
        return at, data["i"]
    except (binascii.Error, ValueError, KeyError, TypeError, UnicodeDecodeError):
        raise BadCursor from None


def _known_emails(organisation_id, emails):
    """The emails some contact in the workspace already has (two plain
    queries, no join made unique)."""
    from services.customers.models import Account, Contact

    if not emails:
        return set()
    rows = Contact.objects.annotate(low=Lower("email")).filter(low__in=emails)
    on_customers = rows.filter(customer__organisation_id=organisation_id)
    on_accounts = rows.filter(
        account_id__in=Account.objects.filter(customers__organisation_id=organisation_id).values(
            "id"
        )
    )
    return set(on_customers.values_list("low", flat=True)) | set(
        on_accounts.values_list("low", flat=True)
    )


def row_payload(row, known, organisation):
    from rest_framework import serializers

    from services.work.clock import today_for

    stamp = serializers.DateTimeField().to_representation
    email = row.requester_email
    return {
        "id": row.pk,
        "source": row.provider,
        "connector": {"id": row.connector_id, "name": row.connector.name},
        "number": row.number,
        "title": row.title,
        "text": row.excerpt,
        "from": {"name": row.requester_name, "email": email},
        "url": row.url,
        "priority": row.priority,
        "opened_on": row.opened_on.isoformat(),
        "last_seen_at": stamp(row.last_seen_at),
        "deletes_on": (
            today_for(organisation, row.last_seen_at) + timedelta(days=KEEP_DAYS)
        ).isoformat(),
        "can_add_contact": bool(email) and email not in known,
    }


def page(reader, key, cursor=None):
    rows = waiting_in(reader, key)
    total = rows.count()
    if cursor:
        at, pk = _decode(key, cursor)
        rows = rows.filter(Q(last_seen_at__lt=at) | Q(last_seen_at=at, id__lt=pk))
    found = list(rows.select_related("connector").order_by("-last_seen_at", "-id")[: PAGE + 1])
    shown = found[:PAGE]
    known = _known_emails(
        reader.organisation_id, {r.requester_email for r in shown if r.requester_email}
    )
    return {
        "queue": key,
        "count": total,
        "items": [row_payload(r, known, reader.organisation) for r in shown],
        "next": _encode(key, shown[-1]) if len(found) > PAGE else None,
    }
```

(Move the new imports to the top of the module with the others.)

- [ ] **Step 4: The route**

Create `services/work/unmatched_views.py`:

```python
"""GET /work/unmatched/, POST /work/unmatched/<id>/match/ and /dismiss/
(agent bundles round 2 D3, contract §3)."""

from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from services.brain.http import ScopeRefusals
from services.connectors import unmatched


class UnmatchedListView(ScopeRefusals, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        try:
            return Response(unmatched.page(request.user, params.get("queue"), params.get("cursor")))
        except unmatched.BadCursor:
            raise ValidationError({"cursor": [unmatched.STALE_CURSOR]}) from None
```

`services/work/urls.py`: `path("unmatched/", unmatched_views.UnmatchedListView.as_view(), name="work-unmatched"),` (import `unmatched_views` beside `views`).

Note: the queue is checked before the cursor (`waiting_in` runs first), so a cursor sent to a queue the reader may not use answers 403, as the test expects.

- [ ] **Step 5: Run them to see them pass**

Run: `$PY manage.py test services.work.tests.test_unmatched_list --parallel auto --noinput`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/connectors/unmatched.py services/work/unmatched_views.py services/work/urls.py services/work/tests/test_unmatched_list.py
git commit -m "feat(work): list a queue's messages that need a customer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Matching an item to a customer

**Files:**
- Modify: `services/connectors/unmatched.py`, `services/work/unmatched_views.py`, `services/work/urls.py`
- Test: `services/work/tests/test_unmatched_match.py` (create)

**Interfaces:**
- Consumes: `threads.touch_ticket` (D2), `scoping.can_open`, `Connector.covers`.
- Produces: `unmatched.match(reader, pk, data, *, request=None) -> (Ticket, contact_added)`; `unmatched.Refused(status, body)`; `POST /work/unmatched/<id>/match/` (contract §3.2, R2D3-8, R2D3-9).

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_unmatched_match.py`:

```python
"""Round 2 D3 contract §3.2, R2D3-8, R2D3-9: matching makes the ticket,
deletes the item, may add the sender as a contact, is audited, and leaves
the thread due for the next run, with no model call in the request."""

from unittest.mock import patch

from core.models import AuditEvent
from services.agents.models import SignalThread
from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors.models import UnmatchedItem
from services.connectors.tests.unmatched_fixtures import item
from services.customers.models import Contact, Ticket


@patch("services.agents.intake.get_completion", side_effect=AssertionError("no model"))
@patch("services.customers.classification.get_completion", side_effect=AssertionError("no model"))
class MatchTests(IntakeFixture):
    def setUp(self):
        self.jira = self.connector("jira", "cs")
        self.row = item(self.jira, external_id="SUP-31", number="SUP-31")

    def match(self, user, body, pk=None):
        return self.client_for(user).post(
            f"/api/v1/work/unmatched/{pk or self.row.pk}/match/", body, format="json"
        )

    def test_carl_matches_it_to_pizza_hut_and_adds_the_sender(self, *_):
        response = self.match(self.csm, {"customer_id": self.pizza.pk, "add_contact": True})
        self.assertEqual(response.status_code, 200, response.json())
        body = response.json()
        ticket = Ticket.objects.get()
        self.assertEqual(
            body,
            {
                "ticket": {
                    "id": ticket.pk,
                    "number": "SUP-31",
                    "record": {"type": "customer", "id": self.pizza.pk, "name": "Pizza Hut"},
                },
                "contact_added": True,
            },
        )
        self.assertEqual(
            (ticket.department, ticket.connector, ticket.external_id), ("cs", self.jira, "SUP-31")
        )
        self.assertFalse(UnmatchedItem.objects.exists())
        self.assertTrue(Contact.objects.filter(customer=self.pizza, email="ann@newco.io").exists())
        thread = SignalThread.objects.get()
        self.assertEqual(
            (thread.ticket, thread.status, thread.customer), (ticket, "new", self.pizza)
        )
        event = AuditEvent.objects.get(action="ticket.matched")
        self.assertEqual(
            event.metadata,
            {
                "item": self.row.pk,
                "provider": "jira",
                "connector": self.jira.pk,
                "record": {"type": "customer", "id": self.pizza.pk},
                "contact_added": True,
            },
        )

    def test_the_refusals_in_order(self, *_):
        self.assertEqual(
            self.match(self.csm, {}).json(), {"record": ["Choose one customer or account."]}
        )
        self.assertEqual(
            self.match(self.csm, {"customer_id": self.pizza.pk, "add_contact": "yes"}).json(),
            {"add_contact": ["Choose on or off."]},
        )
        self.assertEqual(
            self.match(self.csm, {"customer_id": self.taco.pk}).json(),
            {"record": ["Choose a customer or account you can open."]},
        )
        self.assertEqual(
            self.match(self.other, {"customer_id": self.taco.pk}, pk=999999).status_code, 404
        )
        self.assertEqual(self.match(self.erin, {"customer_id": self.pizza.pk}).status_code, 404)

    def test_a_connector_that_does_not_cover_the_record(self, *_):
        self.jira.customers.add(self.taco)
        response = self.match(self.csm, {"customer_id": self.pizza.pk})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "NOT_COVERED")
        self.assertIn("doesn't cover Pizza Hut", response.json()["detail"])

    def test_no_email_to_add(self, *_):
        UnmatchedItem.objects.filter(pk=self.row.pk).update(requester_email="")
        self.assertEqual(
            self.match(self.csm, {"customer_id": self.pizza.pk, "add_contact": True}).json(),
            {"add_contact": ["This message has no sender email to add."]},
        )

    def test_matched_twice_is_gone(self, *_):
        self.match(self.csm, {"customer_id": self.pizza.pk})
        again = self.match(self.csm, {"customer_id": self.pizza.pk})
        self.assertEqual(again.status_code, 404)  # the row is gone

    def test_a_dismissed_row_is_gone(self, *_):
        UnmatchedItem.objects.filter(pk=self.row.pk).update(status="dismissed")
        response = self.match(self.csm, {"customer_id": self.pizza.pk})
        self.assertEqual(
            response.json(),
            {"code": "GONE", "detail": "Someone else dealt with this message. Reload the list."},
        )

    def test_an_existing_contact_is_not_added_twice(self, *_):
        Contact.objects.create(customer=self.pizza, name="Ann", email="Ann@NewCo.io")
        body = self.match(self.csm, {"customer_id": self.pizza.pk, "add_contact": True}).json()
        self.assertFalse(body["contact_added"])
        self.assertEqual(Contact.objects.count(), 1)
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.work.tests.test_unmatched_match --parallel auto --noinput`
Expected: FAIL: 404 on the route.

- [ ] **Step 3: `match`**

Append to `services/connectors/unmatched.py`:

```python
from django.db import transaction

from core import audit

CHOOSE_RECORD = "Choose one customer or account."
CANT_OPEN = "Choose a customer or account you can open."
ON_OR_OFF = "Choose on or off."
NO_EMAIL = "This message has no sender email to add."
GONE = "Someone else dealt with this message. Reload the list."
NOT_COVERED = (
    "{connector} doesn't cover {record}. Choose another, or change the connection in Settings."
)


class Refused(Exception):
    def __init__(self, status, body):
        super().__init__(status)
        self.status = status
        self.body = body


def readable(reader, pk):
    """A waiting or dismissed row the reader's queue holds, else 404."""
    from services.work.queue_bundles import may_use

    row = (
        UnmatchedItem.objects.filter(organisation_id=reader.organisation_id, pk=pk)
        .select_related("connector")
        .first()
    )
    # SOC2:AUTH-02 a row outside the reader's queues reads as missing
    if row is None or not may_use(reader, queue_of(row)):
        raise Refused(404, {"detail": "Not found."})
    return row


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _record(reader, data):
    from services.customers.models import Account, Customer
    from services.customers.scoping import can_open

    ids = {k: data.get(k) for k in ("customer_id", "account_id") if data.get(k) is not None}
    if len(ids) != 1 or not _whole(next(iter(ids.values()))):
        raise Refused(400, {"record": [CHOOSE_RECORD]})
    ((key, pk),) = ids.items()
    model = Customer if key == "customer_id" else Account
    record = model.objects.filter(pk=pk).first()
    # SOC2:AUTH-02 only a record the matcher may open (R2D3-8)
    if record is None or not can_open(reader, record):
        raise Refused(400, {"record": [CANT_OPEN]})
    return record


def _add_contact(row, record):
    from services.customers.models import Customer, Contact

    if row.requester_email in _known_emails(row.organisation_id, {row.requester_email}):
        return False
    on = {"customer": record} if isinstance(record, Customer) else {"account": record}
    name = row.requester_name or row.requester_email.split("@", 1)[0]
    Contact.objects.create(name=name[:150], email=row.requester_email, **on)
    return True


def match(reader, pk, data, *, request=None):
    """Contract §3.2: (Ticket, contact_added), or Refused."""
    from services.agents.threads import touch_ticket
    from services.customers.models import Customer

    row = readable(reader, pk)
    data = data if isinstance(data, dict) else {}
    record = _record(reader, data)
    add = data.get("add_contact", False)
    if not isinstance(add, bool):
        raise Refused(400, {"add_contact": [ON_OR_OFF]})
    on = {"customer": record} if isinstance(record, Customer) else {"account": record}
    if not row.connector.covers(**on):
        detail = NOT_COVERED.format(connector=row.connector.name, record=record.name)
        raise Refused(409, {"code": "NOT_COVERED", "detail": detail})
    if add and not row.requester_email:
        raise Refused(400, {"add_contact": [NO_EMAIL]})
    now = timezone.now()
    with transaction.atomic():
        row = (
            UnmatchedItem.objects.select_for_update()
            .filter(pk=row.pk, status=U.WAITING)
            .select_related("connector")
            .first()
        )
        made = (
            row is not None
            and Ticket.objects.filter(
                connector_id=row.connector_id, external_id=row.external_id
            ).exists()
        )
        if row is None or made:
            raise Refused(409, {"code": "GONE", "detail": GONE})
        ticket = Ticket.objects.create(
            **on,
            connector=row.connector,
            department=row.department,
            external_id=row.external_id,
            ticket_number=row.number,
            title=row.title or row.number,
            description=row.excerpt,
            priority=row.priority,
            assignee_name="Unassigned",
            requester_name=row.requester_name,
            requester_email=row.requester_email,
            external_url=row.url,
            opened_at=row.opened_on,
            synced_at=now,
        )
        added = add and _add_contact(row, record)
        item_id, provider, connector_id = row.pk, row.provider, row.connector_id
        row.delete()
        audit.record(  # SOC2:LOG-01 who put an outside message on which record (R2D3-20)
            "ticket.matched",
            request=request,
            actor=reader,
            organisation=reader.organisation,
            target=ticket,
            metadata={
                "item": item_id,
                "provider": provider,
                "connector": connector_id,
                "record": {"type": "customer" if "customer" in on else "account", "id": record.pk},
                "contact_added": added,
            },
        )
        # R2D3-9: due at the next run, whatever the item's age; no model call here.
        touch_ticket(ticket, now)
    return ticket, added
```

Note on `audit.record(target=ticket)`: `Ticket.__str__` prints its number, title and parent. If `core/audit.py` stores `str(target)`, pass `target_repr=f"Ticket {ticket.pk}"` instead, so no title reaches the audit row (check how other ticket-targeted rows do it: `grep -rn "target=ticket" services`).

- [ ] **Step 4: The route**

In `services/work/unmatched_views.py`:

```python
class UnmatchedMatchView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            ticket, added = unmatched.match(request.user, pk, request.data, request=request)
        except unmatched.Refused as exc:
            return Response(exc.body, status=exc.status)
        record = ticket.customer or ticket.account
        kind = "customer" if ticket.customer_id else "account"
        return Response(
            {
                "ticket": {
                    "id": ticket.pk,
                    "number": ticket.ticket_number,
                    "record": {"type": kind, "id": record.pk, "name": record.name},
                },
                "contact_added": added,
            }
        )
```

`urls.py`: `path("unmatched/<int:pk>/match/", unmatched_views.UnmatchedMatchView.as_view(), name="work-unmatched-match"),`.

- [ ] **Step 5: Run them to see them pass**

Run: `$PY manage.py test services.work.tests.test_unmatched_match services.work.tests.test_unmatched_list --parallel auto --noinput`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/connectors/unmatched.py services/work/unmatched_views.py services/work/urls.py services/work/tests/test_unmatched_match.py
git commit -m "feat(work): match a message to a customer; its thread joins the next run

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Dismissing an item

**Files:**
- Modify: `services/connectors/unmatched.py`, `services/work/unmatched_views.py`, `services/work/urls.py`
- Test: `services/work/tests/test_unmatched_dismiss.py` (create)

**Interfaces:**
- Produces: `unmatched.dismiss(reader, pk, *, request=None)`; `POST /work/unmatched/<id>/dismiss/` (contract §3.3, R2D3-10).

- [ ] **Step 1: Write the failing tests**

```python
"""Round 2 D3 contract §3.3, R2D3-10: dismissing blanks the text at once,
keeps a tombstone so Jira can't list it again, and is audited."""

from core.models import AuditEvent
from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors import unmatched
from services.connectors.models import UnmatchedItem
from services.connectors.tests.unmatched_fixtures import item, remote


class DismissTests(IntakeFixture):
    def setUp(self):
        self.jira = self.connector("jira", "cs")
        self.row = item(self.jira, external_id="SUP-40")

    def dismiss(self, user, pk=None):
        return self.client_for(user).post(
            f"/api/v1/work/unmatched/{pk or self.row.pk}/dismiss/", {}, format="json"
        )

    def test_dismiss_blanks_the_text_and_keeps_a_tombstone(self):
        self.assertEqual(self.dismiss(self.csm).json(), {"dismissed": True})
        row = UnmatchedItem.objects.get()
        self.assertEqual(
            (
                row.status,
                row.title,
                row.excerpt,
                row.requester_name,
                row.requester_email,
                row.dismissed_by,
            ),
            ("dismissed", "", "", "", "", self.csm),
        )
        unmatched.keep(self.jira, remote(external_id="SUP-40"))
        self.assertEqual(UnmatchedItem.objects.get().status, "dismissed")
        self.assertEqual(
            AuditEvent.objects.get(action="unmatched.dismissed").metadata,
            {"provider": "jira", "connector": self.jira.pk},
        )

    def test_twice_is_gone_and_another_department_is_not_found(self):
        self.dismiss(self.csm)
        self.assertEqual(self.dismiss(self.csm).json()["code"], "GONE")
        self.assertEqual(self.dismiss(self.erin).status_code, 404)
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.work.tests.test_unmatched_dismiss --parallel auto --noinput`
Expected: FAIL: 404 on the route.

- [ ] **Step 3: `dismiss` and its route**

```python
def dismiss(reader, pk, *, request=None):
    """Contract §3.3: the row's text goes at once; the tombstone stays (R2D3-10)."""
    row = readable(reader, pk)
    with transaction.atomic():
        locked = (
            UnmatchedItem.objects.select_for_update().filter(pk=row.pk, status=U.WAITING).first()
        )
        if locked is None:
            raise Refused(409, {"code": "GONE", "detail": GONE})
        locked.status = U.DISMISSED
        locked.title = locked.excerpt = locked.requester_name = locked.requester_email = ""
        locked.dismissed_by = reader
        locked.dismissed_at = timezone.now()
        locked.save(
            update_fields=[
                "status",
                "title",
                "excerpt",
                "requester_name",
                "requester_email",
                "dismissed_by",
                "dismissed_at",
            ]
        )
        audit.record(  # SOC2:LOG-01 who set an outside message aside
            "unmatched.dismissed",
            request=request,
            actor=reader,
            organisation=reader.organisation,
            target=locked,
            metadata={"provider": locked.provider, "connector": locked.connector_id},
        )
```

`UnmatchedDismissView.post` answers `{"dismissed": True}` or the `Refused` body; URL `unmatched/<int:pk>/dismiss/` named `work-unmatched-dismiss`.

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.work.tests.test_unmatched_dismiss --parallel auto --noinput`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/connectors/unmatched.py services/work/unmatched_views.py services/work/urls.py services/work/tests/test_unmatched_dismiss.py
git commit -m "feat(work): dismiss a message that needs no customer; its text goes at once

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The 30-day purge

**Files:**
- Modify: `services/connectors/unmatched.py`, `services/connectors/management/commands/sync_tickets.py`
- Test: `services/connectors/tests/test_unmatched_purge.py` (create)

**Interfaces:**
- Produces: `unmatched.purge(*, now=None) -> int`; `sync_tickets` (without `--connector`) purges at the end; `unmatched.purged` audit (contract R2D3-11, §7).

- [ ] **Step 1: Write the failing tests**

```python
"""Round 2 D3 R2D3-11: rows last seen more than 30 days ago go, waiting and
dismissed alike, audited per workspace as counts; sync_tickets runs it."""

from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.utils import timezone

from core.models import AuditEvent
from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors import unmatched
from services.connectors.models import UnmatchedItem
from services.connectors.tests.unmatched_fixtures import item


class PurgeTests(IntakeFixture):
    def test_old_rows_go_and_fresh_ones_stay(self):
        jira = self.connector("jira", "cs")
        old = timezone.now() - timedelta(days=31)
        item(jira, last_seen_at=old)
        item(jira, last_seen_at=old, status="dismissed", title="", excerpt="")
        fresh = item(jira)
        self.assertEqual(unmatched.purge(), 2)
        self.assertEqual(list(UnmatchedItem.objects.values_list("pk", flat=True)), [fresh.pk])
        event = AuditEvent.objects.get(action="unmatched.purged")
        self.assertEqual((event.actor, event.metadata), (None, {"deleted": 2, "dismissed": 1}))

    def test_nothing_to_purge_writes_nothing(self):
        self.assertEqual(unmatched.purge(), 0)
        self.assertFalse(AuditEvent.objects.filter(action="unmatched.purged").exists())

    def test_sync_tickets_purges(self):
        item(self.connector("jira", "cs"), last_seen_at=timezone.now() - timedelta(days=40))
        call_command("sync_tickets", stdout=StringIO())
        self.assertFalse(UnmatchedItem.objects.exists())
```

(The `sync_tickets` test's connector has fake credentials and `use_jira` is not set: if the command tries to reach Jira, add `use_jira(self)` with an empty `synced` list.)

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.connectors.tests.test_unmatched_purge --parallel auto --noinput`
Expected: FAIL: `AttributeError: module ... has no attribute 'purge'`.

- [ ] **Step 3: `purge` and the command**

```python
def purge(*, now=None):
    """R2D3-11: rows last seen more than KEEP_DAYS ago go; one audit row per
    workspace that lost any. Returns how many went."""
    from django.db.models import Count

    from services.accounts.models import Organisation

    now = now or timezone.now()
    old = UnmatchedItem.objects.filter(last_seen_at__lt=now - timedelta(days=KEEP_DAYS))
    per = list(
        old.values("organisation_id")
        .annotate(deleted=Count("id"), dismissed=Count("id", filter=Q(status=U.DISMISSED)))
        .order_by("organisation_id")
    )
    if not per:
        return 0
    deleted, _ = old.delete()
    workspaces = Organisation.objects.in_bulk([row["organisation_id"] for row in per])
    for row in per:
        audit.record(  # SOC2:LOG-01 SOC2:DATA-04 retention ran: counts only, no actor
            "unmatched.purged",
            actor=None,
            organisation=workspaces[row["organisation_id"]],
            metadata={"deleted": row["deleted"], "dismissed": row["dismissed"]},
        )
    return deleted
```

`sync_tickets.py` `handle`, after the summary line:

```python
        if not options["connector"]:
            # Round 2 D3 (R2D3-11): unmatched items go 30 days after they were last seen.
            from services.connectors.unmatched import purge

            gone = purge()
            if gone:
                self.stdout.write(f"deleted {gone} unmatched item(s) past 30 days")
```

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.connectors --parallel auto --noinput`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/connectors/unmatched.py services/connectors/management/commands/sync_tickets.py services/connectors/tests/test_unmatched_purge.py
git commit -m "feat(connectors): delete unmatched items 30 days after they were last seen

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The rail counts what needs a customer

**Files:**
- Modify: `services/work/queues.py`
- Test: `services/work/tests/test_queues.py` (append)

**Interfaces:**
- Produces: every `GET /work/queues/` row has `needs_customer` (contract §4, R2D3-12).

- [ ] **Step 1: Write the failing tests**

Append to the queues test class (it builds connectors and people; check its fixture with `sed -n 1,40p services/work/tests/test_queues.py`; if it is not an `IntakeFixture`, add a new class on `IntakeFixture` in the same file):

```python
def test_a_routed_queue_counts_what_needs_a_customer(self):
    from services.connectors.tests.unmatched_fixtures import item

    jira = self.connector("jira", "cs")
    item(jira)
    item(jira)
    rows = {
        row["key"]: row
        for row in self.client_for(self.csm).get("/api/v1/work/queues/").json()["queues"]
    }
    self.assertEqual(rows["department:cs"]["needs_customer"], 2)
    self.assertEqual(rows["department:cs"]["count"], 0)
    self.assertIsNone(rows["mine"]["needs_customer"])
    self.assertIsNone(rows["history"]["needs_customer"])


def test_a_failing_item_count_leaves_the_bundle_count(self):
    from unittest.mock import patch

    self.connector("jira", "cs")
    with patch("services.connectors.unmatched.count", side_effect=RuntimeError):
        rows = self.client_for(self.csm).get("/api/v1/work/queues/").json()
    cs = next(row for row in rows["queues"] if row["key"] == "department:cs")
    self.assertEqual((cs["count"], cs["needs_customer"], rows["failed"]), (0, None, []))
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.work.tests.test_queues --parallel auto --noinput`
Expected: FAIL: `KeyError: 'needs_customer'`.

- [ ] **Step 3: The count**

In `services/work/queues.py` `build`, after the queue's `count`:

```python
needs = None
if queue_bundles.is_queue_key(queue.key):
    try:
        with transaction.atomic():
            needs = unmatched.count(reader, queue.key)
    except Exception as exc:  # noqa: BLE001 - R2D3-12: the rail never fails for it
        logger.warning("work queues: %s items failed: %s", queue.key, type(exc).__name__)
queues.append({"key": queue.key, "label": queue.label, "count": count, "needs_customer": needs})
```

with `from services.connectors import unmatched` at the top.

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.work --parallel auto --noinput`
Expected: OK (the existing rail tests compare whole rows: add `"needs_customer": None` / the count to their expected rows where they do; that is the wire change the contract names).

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/work/queues.py services/work/tests/test_queues.py
git commit -m "feat(work): the queue rail counts the messages that need a customer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Fast lane settings

**Files:**
- Modify: `services/accounts/models.py`, `services/agents/settings_api.py`
- Create: `services/accounts/migrations/0017_organisation_fast_lane.py` (by `makemigrations`), `services/agents/fast_lane.py`
- Test: `services/agents/tests/test_fast_lane_settings.py` (create)

**Interfaces:**
- Produces: `Organisation.ai_fast_lane`, `Organisation.ai_fast_ran_at`; `fast_lane.settings(organisation) -> dict` (defaults filled), `fast_lane.clean(organisation, asked) -> (merged, errors)`, `fast_lane.used(organisation, now) -> (hour, day)`, `fast_lane.payload(organisation, now)`; constants (contract §10); `signals.fast_lane` in GET, `fast_lane` in PATCH (contract §5.1, §5.2).

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_fast_lane_settings.py`:

```python
"""Round 2 D3 contract §5.1, §5.2, R2D3-13, R2D3-18, R2D3-19: the fast lane's
settings: off by default, admins only, every refusal at once, audited with
old and new values, and today's use read from fast-lane model calls."""

from datetime import timedelta

from django.utils import timezone

from core.models import AuditEvent
from services.agents.tests.intake_fixtures import IntakeFixture
from services.copilot.models import ModelCall

URL = "/api/v1/agents/settings/"


class FastLaneSettingsTests(IntakeFixture):
    def lane(self, user=None):
        return self.client_for(user or self.admin).get(URL).json()["signals"]["fast_lane"]

    def patch(self, body, user=None):
        return self.client_for(user or self.admin).patch(URL, {"fast_lane": body}, format="json")

    def test_off_by_default_with_the_limits(self):
        lane = self.lane(self.csm)
        self.assertEqual(
            {k: lane[k] for k in ("on", "rules", "per_hour", "per_day", "used_hour", "used_day")},
            {
                "on": False,
                "rules": {
                    "jira_priority": True,
                    "slack_connectors": [],
                    "senders": [],
                    "words": [],
                    "poor_health": False,
                },
                "per_hour": 10,
                "per_day": 50,
                "used_hour": 0,
                "used_day": 0,
            },
        )
        self.assertEqual(
            lane["limits"], {"per_hour": 10, "per_day": 50, "senders": 50, "words": 20}
        )

    def test_an_admin_switches_it_on_with_words_and_it_is_audited(self):
        response = self.patch({"on": True, "rules": {"words": [" Outage ", "outage", "data loss"]}})
        self.assertEqual(response.status_code, 200, response.json())
        lane = response.json()["signals"]["fast_lane"]
        self.assertEqual((lane["on"], lane["rules"]["words"]), (True, ["outage", "data loss"]))
        changes = AuditEvent.objects.get(action="agents.settings_update").metadata["changes"]
        self.assertIn("ai_fast_lane", changes["organisation"])

    def test_a_member_may_not_change_it(self):
        self.assertEqual(self.patch({"on": True}, user=self.csm).status_code, 403)

    def test_every_refusal_at_once(self):
        slack = self.connector("slack", "cs")
        response = self.patch(
            {
                "on": "yes",
                "rules": {
                    "words": ["x"],
                    "senders": ["not an address"],
                    "slack_connectors": [slack.pk, 999999],
                    "colour": "red",
                },
                "per_hour": 11,
                "per_day": 51,
            }
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["fast_lane"],
            {
                "on": ["Choose on or off."],
                "rules": {
                    "words": ["Use 2 to 40 characters for each word."],
                    "senders": ["Use an email address or @domain for each sender."],
                    "slack_connectors": ["Choose Slack connections from the list."],
                    "colour": ["Unknown setting."],
                },
                "per_hour": ["Choose a whole number from 0 to 10."],
                "per_day": ["Choose a whole number from 0 to 50."],
            },
        )

    def test_the_hourly_limit_may_not_pass_the_daily(self):
        self.patch({"per_day": 5})
        self.assertEqual(
            self.patch({"per_hour": 6}).json()["fast_lane"],
            {"per_hour": ["The hourly limit can't be more than the daily limit."]},
        )

    def test_use_counts_only_ok_fast_lane_agent_calls(self):
        now = timezone.now()
        rows = [
            ("agent_cs", "fast_lane", "ok", now - timedelta(minutes=10)),
            ("agent_cs", "fast_lane", "ok", now - timedelta(hours=3)),
            ("agent_cs", "fast_lane", "failed", now - timedelta(minutes=5)),
            ("agent_cs", "", "ok", now - timedelta(minutes=5)),
            ("copilot", "fast_lane", "ok", now - timedelta(minutes=5)),
        ]
        for purpose, scope, outcome, at in rows:
            call = ModelCall.objects.create(
                organisation=self.org, purpose=purpose, scope_key=scope, outcome=outcome
            )
            ModelCall.objects.filter(pk=call.pk).update(created_at=at)
        lane = self.lane()
        self.assertEqual((lane["used_hour"], lane["used_day"]), (1, 2))
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_fast_lane_settings --parallel auto --noinput`
Expected: FAIL: `KeyError: 'fast_lane'`.

- [ ] **Step 3: The fields**

In `services/accounts/models.py`, after `ai_signals_ran_at`:

```python
    #: The fast lane (agent bundles round 2 D3, contract §1.3): admins' rules and
    #: caps (a missing key reads as its default), and the 5-minute tick's claim.
    ai_fast_lane = models.JSONField(default=dict, blank=True)
    ai_fast_ran_at = models.DateTimeField(null=True, blank=True)
```

Run: `$PY manage.py makemigrations accounts`.

- [ ] **Step 4: `fast_lane.py` (settings half)**

Create `services/agents/fast_lane.py`:

```python
"""The fast lane (agent bundles round 2 D3, contract §5, R2D3-13 to
R2D3-19): rules only, never a model; off by default; a 2-minute quiet window
on a 5-minute tick; at most 10 calls an hour and 50 a day per workspace,
each an ordinary agent call (credits, budget)."""

import re
from datetime import timedelta

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email

SCOPE_KEY = "fast_lane"
QUIET = timedelta(minutes=2)
TICK = timedelta(minutes=5)
TICK_GRACE = timedelta(seconds=30)
MAX_PER_TICK = 10
PER_HOUR_MAX = 10
PER_DAY_MAX = 50
WORDS_MAX = 20
SENDERS_MAX = 50
TEXT_CHARS = 2000
AGENT_PURPOSES = ("agent_cs", "agent_sales", "agent_ops")

DEFAULT_RULES = {
    "jira_priority": True,
    "slack_connectors": [],
    "senders": [],
    "words": [],
    "poor_health": False,
}
DEFAULTS = {"on": False, "per_hour": PER_HOUR_MAX, "per_day": PER_DAY_MAX}

LANE_OBJECT = "Send the fast lane as one object."
UNKNOWN = "Unknown setting."
ON_OR_OFF = "Choose on or off."
TOO_MANY_WORDS = f"Add at most {WORDS_MAX} words."
WORD_SIZE = "Use 2 to 40 characters for each word."
TOO_MANY_SENDERS = f"Add at most {SENDERS_MAX} senders."
SENDER_SHAPE = "Use an email address or @domain for each sender."
SLACK_FROM_LIST = "Choose Slack connections from the list."
HOURLY = f"Choose a whole number from 0 to {PER_HOUR_MAX}."
DAILY = f"Choose a whole number from 0 to {PER_DAY_MAX}."
HOUR_OVER_DAY = "The hourly limit can't be more than the daily limit."
DOMAIN = re.compile(r"^@[a-z0-9-]+(\.[a-z0-9-]+)+$")


def settings(organisation):
    stored = organisation.ai_fast_lane if isinstance(organisation.ai_fast_lane, dict) else {}
    rules = {**DEFAULT_RULES, **(stored.get("rules") or {})}
    return {**DEFAULTS, **{k: stored[k] for k in DEFAULTS if k in stored}, "rules": rules}


def _whole(value, top):
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= top


def _sender(value):
    if not isinstance(value, str):
        return None
    value = value.strip().lower()
    if DOMAIN.match(value):
        return value
    try:
        validate_email(value)
    except DjangoValidationError:
        return None
    return value


def _clean_rules(organisation, asked, rules, errors):
    from services.connectors.models import Connector

    for key, value in asked.items():
        if key in ("jira_priority", "poor_health"):
            if isinstance(value, bool):
                rules[key] = value
            else:
                errors[key] = [ON_OR_OFF]
        elif key == "words":
            if not isinstance(value, list) or len(value) > WORDS_MAX:
                errors[key] = [TOO_MANY_WORDS]
                continue
            words = [w.strip().lower() if isinstance(w, str) else "" for w in value]
            if any(not 2 <= len(w) <= 40 for w in words):
                errors[key] = [WORD_SIZE]
            else:
                rules[key] = list(dict.fromkeys(words))
        elif key == "senders":
            if not isinstance(value, list) or len(value) > SENDERS_MAX:
                errors[key] = [TOO_MANY_SENDERS]
                continue
            senders = [_sender(v) for v in value]
            if None in senders:
                errors[key] = [SENDER_SHAPE]
            else:
                rules[key] = list(dict.fromkeys(senders))
        elif key == "slack_connectors":
            mine = set(
                Connector.objects.filter(
                    organisation=organisation, provider=Connector.Provider.SLACK
                ).values_list("id", flat=True)
            )
            ok = isinstance(value, list) and all(
                isinstance(v, int) and not isinstance(v, bool) and v in mine for v in value
            )
            if ok:
                rules[key] = sorted(set(value))
            else:
                errors[key] = [SLACK_FROM_LIST]
        else:
            errors[key] = [UNKNOWN]


def clean(organisation, asked):
    """(the merged settings to store, {} ) or (None, the errors) (contract §5.2)."""
    if not isinstance(asked, dict):
        return None, [LANE_OBJECT]
    merged = settings(organisation)
    rules = dict(merged["rules"])
    errors = {}
    for key, value in asked.items():
        if key == "on":
            if isinstance(value, bool):
                merged["on"] = value
            else:
                errors["on"] = [ON_OR_OFF]
        elif key == "per_hour":
            if _whole(value, PER_HOUR_MAX):
                merged["per_hour"] = value
            else:
                errors["per_hour"] = [HOURLY]
        elif key == "per_day":
            if _whole(value, PER_DAY_MAX):
                merged["per_day"] = value
            else:
                errors["per_day"] = [DAILY]
        elif key == "rules":
            if not isinstance(value, dict):
                errors["rules"] = [LANE_OBJECT]
                continue
            wrong = {}
            _clean_rules(organisation, value, rules, wrong)
            if wrong:
                errors["rules"] = wrong
        else:
            errors[key] = [UNKNOWN]
    if not errors and merged["per_hour"] > merged["per_day"]:
        errors["per_hour"] = [HOUR_OVER_DAY]
    if errors:
        return None, errors
    merged["rules"] = rules
    return merged, {}


def used(organisation, now):
    """(fast-lane calls in the last hour, in the last 24 hours) (R2D3-18)."""
    from services.copilot.models import ModelCall

    rows = ModelCall.objects.filter(
        organisation=organisation,
        purpose__in=AGENT_PURPOSES,
        scope_key=SCOPE_KEY,
        outcome=ModelCall.Outcome.OK,
        created_at__gte=now - timedelta(hours=24),
    )
    return rows.filter(created_at__gte=now - timedelta(hours=1)).count(), rows.count()


def payload(organisation, now):
    from services.connectors.models import Connector

    current = settings(organisation)
    hour, day = used(organisation, now)
    slack = Connector.objects.filter(
        organisation=organisation, provider=Connector.Provider.SLACK, is_enabled=True
    ).order_by("name", "id")
    return {
        **current,
        "used_hour": hour,
        "used_day": day,
        "limits": {
            "per_hour": PER_HOUR_MAX,
            "per_day": PER_DAY_MAX,
            "senders": SENDERS_MAX,
            "words": WORDS_MAX,
        },
        "slack_choices": [{"id": c.pk, "name": c.name} for c in slack],
    }
```

- [ ] **Step 5: The settings route**

In `services/agents/settings_api.py`:

- `signals_payload(organisation)` adds `"fast_lane": fast_lane.payload(organisation, timezone.now())` (import `from django.utils import timezone` and `from . import fast_lane`).
- `changes_from` adds:

```python
    if "fast_lane" in data:
        merged, wrong = fast_lane.clean(organisation, data["fast_lane"])
        if wrong:
            errors["fast_lane"] = wrong
        elif merged != fast_lane.settings(organisation):
            changes["organisation"]["ai_fast_lane"] = merged
```

`_old_and_new` already reads `getattr(organisation, "ai_fast_lane")` for the old value; the audit row's `fields` lists `ai_fast_lane`. (The old value is the stored JSON, possibly `{}`: write `fast_lane.settings(organisation)` as the old value instead, so the audit shows defaults rather than `{}`: special-case the key in `_old_and_new`.)

- [ ] **Step 6: Run them to see them pass**

Run: `$PY manage.py test services.agents.tests.test_fast_lane_settings services.agents.tests.test_api_settings --parallel auto --noinput && $PY manage.py makemigrations --check --dry-run`
Expected: OK; "No changes detected". (A settings test comparing the whole `signals` object needs the new key; add it there.)

- [ ] **Step 7: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/accounts/models.py services/accounts/migrations/0017_organisation_fast_lane.py services/agents/fast_lane.py services/agents/settings_api.py services/agents/tests/test_fast_lane_settings.py services/agents/tests/test_api_settings.py
git commit -m "feat(agents): fast lane settings: rules and caps, off by default, admins only

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: A thread knows it is urgent

**Files:**
- Modify: `services/agents/models.py` (`SignalThread.urgent_rule`), `services/agents/fast_lane.py`, `services/agents/threads.py`
- Create: `services/agents/migrations/0006_signal_thread_urgent.py` (by `makemigrations`)
- Test: `services/agents/tests/test_fast_lane_rules.py` (create)

**Interfaces:**
- Produces: `fast_lane.rule_for(lane, *, source, connector_id, priority, sender, text, record) -> str` (contract §5.3); `fast_lane.for_ticket(ticket)`, `fast_lane.for_email(email)`; `touch_ticket` / `touch_mail` store `urgent_rule` (R2D3-15).

- [ ] **Step 1: Write the failing tests**

```python
"""Round 2 D3 contract §5.3, R2D3-13 to R2D3-15: which rule makes a thread
urgent, decided at sync, never by a model; nothing while the lane is off."""

from decimal import Decimal

from services.agents import fast_lane, threads
from services.agents.tests.intake_fixtures import IntakeFixture
from services.customers.models import Customer, Ticket


class RuleTests(IntakeFixture):
    def lane(self, **rules):
        self.org.ai_fast_lane = {"on": True, "rules": rules}
        self.org.save(update_fields=["ai_fast_lane"])

    def ticket(
        self, connector, *, title="Hello", priority="medium", email="ann@pizzahut.com", record=None
    ):
        return Ticket.objects.create(
            customer=record or self.pizza,
            connector=connector,
            department=connector.department,
            external_id=f"T-{Ticket.objects.count() + 1}",
            ticket_number="T-1",
            title=title,
            description="",
            priority=priority,
            assignee_name="Unassigned",
            requester_email=email,
            opened_at=self.today,
        )

    def touched(self, ticket):
        ticket.connector.refresh_from_db()
        return threads.touch_ticket(ticket).urgent_rule

    def test_off_means_never_urgent(self):
        jira = self.connector("jira", "cs")
        self.assertEqual(self.touched(self.ticket(jira, priority="critical")), "")

    def test_jira_top_priority(self):
        self.lane()
        jira = self.connector("jira", "cs")
        self.assertEqual(self.touched(self.ticket(jira, priority="critical")), "jira_priority")
        self.assertEqual(self.touched(self.ticket(jira, priority="high")), "")

    def test_a_named_slack_channel_a_sender_and_a_word(self):
        slack = self.connector("slack", "cs")
        jira = self.connector("jira", "cs")
        self.lane(
            slack_connectors=[slack.pk],
            senders=["@bigco.com"],
            words=["outage"],
            jira_priority=False,
        )
        self.assertEqual(self.touched(self.ticket(slack)), "slack_channel")
        self.assertEqual(self.touched(self.ticket(jira, email="ceo@bigco.com")), "sender")
        self.assertEqual(self.touched(self.ticket(jira, title="Total OUTAGE now")), "word")
        self.assertEqual(self.touched(self.ticket(jira, title="outages report")), "")

    def test_a_customer_in_poor_health(self):
        self.lane(poor_health=True, jira_priority=False)
        Customer.objects.filter(pk=self.dough.pk).update(health_score=Decimal("2.0"))
        self.dough.refresh_from_db()
        jira = self.connector("jira", "cs")
        self.assertEqual(self.touched(self.ticket(jira, record=self.dough)), "poor_health")
        self.assertEqual(self.touched(self.ticket(jira)), "")

    def test_a_quieter_message_clears_it(self):
        self.lane(words=["outage"])
        jira = self.connector("jira", "cs")
        ticket = self.ticket(jira, title="outage")
        self.assertEqual(self.touched(ticket), "word")
        Ticket.objects.filter(pk=ticket.pk).update(title="All fine now")
        ticket.refresh_from_db()
        self.assertEqual(self.touched(ticket), "")
```

Add one mail case with the D2 mail helpers (`inbound(record, owner)` in `drafts_fixtures`: check its arguments) where the lane's `senders` names the email's `from_address`, and `touch_mail(email).urgent_rule == "sender"`.

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_fast_lane_rules --parallel auto --noinput`
Expected: FAIL: `AttributeError: 'SignalThread' object has no attribute 'urgent_rule'`.

- [ ] **Step 3: The field**

`SignalThread`:

```python
    #: Round 2 D3 (R2D3-15): the fast-lane rule its newest item matched at
    #: sync, or "" (never a model's judgement).
    urgent_rule = models.CharField(max_length=16, blank=True, default="")
```

and in `Meta.indexes`: `models.Index(fields=["organisation", "urgent_rule", "last_message_at"], name="signal_thread_urgent")`. Run `$PY manage.py makemigrations agents`.

- [ ] **Step 4: The rules**

Append to `services/agents/fast_lane.py`:

```python
def _word_in(term, text):
    return re.search(rf"(?<!\w){re.escape(term)}(?!\w)", text, re.IGNORECASE) is not None


def _poor(record):
    from services.customers.models import Customer, health_category_for

    score = getattr(record, "health_score", None)
    return score is not None and health_category_for(score) == Customer.HealthCategory.POOR


def rule_for(lane, *, source, connector_id, priority, sender, text, record):
    """The first rule the item matches, in the contract §5.3 order, else ""."""
    if not lane["on"]:
        return ""
    rules = lane["rules"]
    sender = (sender or "").lower()
    if source == "slack" and connector_id in rules["slack_connectors"]:
        return "slack_channel"
    if source == "jira" and rules["jira_priority"] and priority == "critical":
        return "jira_priority"
    domain = "@" + sender.rsplit("@", 1)[-1] if "@" in sender else ""
    if sender and any(s == sender or s == domain for s in rules["senders"]):
        return "sender"
    if any(_word_in(word, text) for word in rules["words"]):
        return "word"
    if rules["poor_health"] and record is not None and _poor(record):
        return "poor_health"
    return ""


def for_ticket(ticket):
    connector = ticket.connector
    lane = settings(connector.organisation)
    if not lane["on"]:
        return ""
    return rule_for(
        lane,
        source=connector.provider,
        connector_id=connector.pk,
        priority=ticket.priority,
        sender=ticket.requester_email,
        text=f"{ticket.title}\n{ticket.description[:TEXT_CHARS]}",
        record=ticket.account or ticket.customer,
    )


def for_email(email):
    lane = settings(email.mailbox.organisation)
    if not lane["on"]:
        return ""
    return rule_for(
        lane,
        source="mail",
        connector_id=None,
        priority="",
        sender=email.from_address,
        text=f"{email.subject}\n{email.body[:TEXT_CHARS]}",
        record=email.account or email.customer,
    )
```

(`Account` has a `health_score` too: check `grep -n "health_score = " services/customers/models.py`; `health_category_for` is module-level in `services/customers/models.py`.)

- [ ] **Step 5: The touches**

In `services/agents/threads.py`, `touch_mail`'s `fields` gains `"urgent_rule": fast_lane.for_email(email)` and `touch_ticket`'s `"urgent_rule": fast_lane.for_ticket(ticket)` (import `from . import fast_lane` inside each function, as the module avoids import cycles). Because `_touch` writes every key of `fields` on each touch, the rule is recomputed every time (R2D3-15).

- [ ] **Step 6: Run them to see them pass**

Run: `$PY manage.py test services.agents services.connectors services.mail --parallel auto --noinput && $PY manage.py makemigrations --check --dry-run`
Expected: OK. If a pinned sync or mail query count grows by exactly the lane read (one query for the workspace's settings when `connector.organisation` / `email.mailbox.organisation` is not already loaded), re-pin it with a comment naming R2D3-15 and note it in "Changes during the build"; more than one is a bug.

- [ ] **Step 7: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/models.py services/agents/migrations/0006_signal_thread_urgent.py services/agents/fast_lane.py services/agents/threads.py services/agents/tests/test_fast_lane_rules.py
git commit -m "feat(agents): a synced thread records the fast-lane rule it matched

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The fast tick

**Files:**
- Modify: `services/agents/intake.py`, `services/agents/management/commands/run_agent_signals.py`, `docker-compose.yml`
- Test: `services/agents/tests/test_fast_lane_run.py` (create)

**Interfaces:**
- Consumes: `fast_lane.settings`, `used`, `QUIET`, `TICK`, `MAX_PER_TICK`, `SCOPE_KEY` (Tasks 9, 10).
- Produces: `intake.process(..., lane="interval")`, `intake.read_thread(..., scope_key="")`, `intake.run_fast(*, now=None, organisation=None) -> FastResult`, `run_agent_signals --lane` (contract §5.4, R2D3-16 to R2D3-18, R2D3-20).

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_fast_lane_run.py`:

```python
"""Round 2 D3 R2D3-16 to R2D3-18, R2D3-20: the fast tick reads urgent
threads after 2 quiet minutes, through the same gates and waiting-bundle
rule, marks its calls, stops at the caps and leaves the interval alone."""

from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.agents import intake
from services.agents.models import AgentBundle, SignalThread
from services.agents.tests.intake_fixtures import MODEL, IntakeFixture
from services.copilot.models import ModelCall


class FastTickTests(IntakeFixture):
    def setUp(self):
        self.org.ai_fast_lane = {"on": True, "per_hour": 2, "per_day": 3}
        self.org.save(update_fields=["ai_fast_lane"])
        self.jira = self.connector("jira", "cs")

    def urgent(self, minutes_ago=3, number="SUP-1"):
        _, thread = self.ticket_thread(self.pizza, connector=self.jira, number=number)
        SignalThread.objects.filter(pk=thread.pk).update(
            urgent_rule="jira_priority",
            last_message_at=timezone.now() - timedelta(minutes=minutes_ago),
        )
        return SignalThread.objects.get(pk=thread.pk)

    def run_fast(self, answer):
        with (
            patch(MODEL, return_value=answer) as model,
            patch("services.agents.policy.plan_credits", return_value=3000),
        ):
            result = intake.run_fast()
        return result, model

    def test_an_urgent_thread_is_read_after_two_quiet_minutes(self):
        thread = self.urgent()
        result, model = self.run_fast(self.note_answer(thread))
        self.assertEqual(result.threads, 1)
        self.assertEqual(model.call_args.kwargs["scope_key"], "fast_lane")
        self.assertTrue(AgentBundle.objects.filter(thread=thread).exists())
        self.assertIsNone(Organisation.objects.get(pk=self.org.pk).ai_signals_ran_at)
        event = AuditEvent.objects.get(action="agent_signals.run")
        self.assertEqual((event.metadata["lane"], event.metadata["capped"]), ("fast", False))

    def test_a_busy_or_quiet_thread_waits(self):
        self.urgent(minutes_ago=1)
        _, plain = self.ticket_thread(self.pizza, connector=self.jira, number="SUP-2")
        result, model = self.run_fast("{}")
        self.assertEqual((result.threads, model.call_count), (0, 0))
        self.assertFalse(AuditEvent.objects.filter(action="agent_signals.run").exists())

    def test_off_or_ai_off_reads_nothing(self):
        self.urgent()
        Organisation.objects.filter(pk=self.org.pk).update(ai_agent_enabled=False)
        self.assertEqual(self.run_fast("{}")[0].threads, 0)

    def test_the_hourly_cap_leaves_threads_for_the_interval(self):
        for _ in range(2):
            ModelCall.objects.create(
                organisation=self.org, purpose="agent_cs", scope_key="fast_lane", outcome="ok"
            )
        self.urgent()
        result, model = self.run_fast("{}")
        self.assertEqual((result.threads, model.call_count, result.capped), (0, 0, 1))
        event = AuditEvent.objects.get(action="agent_signals.run")
        self.assertTrue(event.metadata["capped"])

    def test_a_tick_is_claimed_once_per_five_minutes(self):
        self.urgent()
        self.run_fast("{}")
        self.urgent(number="SUP-9")
        self.assertEqual(self.run_fast("{}")[0].threads, 0)

    def test_an_edited_waiting_bundle_is_flagged_without_a_call(self):
        thread = self.urgent()
        bundle = self.message_bundle(thread, self.note_item(thread))
        AgentBundle.objects.filter(pk=bundle.pk).update(edited_at=timezone.now())
        result, model = self.run_fast("{}")
        self.assertEqual((result.flagged, model.call_count), (1, 0))
```

(`note_answer(thread)` and `note_item(thread)`: build the fake model answer exactly as `test_intake_run.py` does for a `note.create` item (it uses `self.thread_ctx`, `self.thread_line` and `self.answer(item)`); copy that helper into the class. `message_bundle(thread, ...)`'s step argument shape is in `intake_fixtures.py`.)

Add to `services/agents/tests/test_intake_run.py` one test that the interval run's model call has `scope_key == ""` and its audit row has `lane == "interval"`.

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_fast_lane_run --parallel auto --noinput`
Expected: FAIL: `AttributeError: module 'services.agents.intake' has no attribute 'run_fast'`.

- [ ] **Step 3: The lane through `process`**

In `services/agents/intake.py`:

```python
def read_thread(organisation, agent, allowed, ctx, *, user=None, scope_key=""):
    raw = get_completion(
        ...,
        user=user,
        scope_key=scope_key,
    )
```

`process(..., result, lane="interval")` passes `scope_key=fast_lane.SCOPE_KEY if lane == "fast" else ""` to `read_thread`. `run_workspace`'s audit metadata becomes `{**result.counts(), "lane": "interval"}`.

- [ ] **Step 4: `run_fast`**

```python
@dataclass
class FastResult(IntakeResult):
    #: workspaces whose cap stopped urgent threads this tick
    capped: int = 0
    workspaces: int = 0


def fast_due(organisation, now):
    ran = organisation.ai_fast_ran_at
    return ran is None or ran <= now - fast_lane.TICK + fast_lane.TICK_GRACE


def claim_fast(organisation, now):
    """Compare-and-set on `ai_fast_ran_at` (R2D3-16); never `ai_signals_ran_at`."""
    rows = Organisation.objects.filter(pk=organisation.pk)
    seen = organisation.ai_fast_ran_at
    rows = (
        rows.filter(ai_fast_ran_at__isnull=True)
        if seen is None
        else rows.filter(ai_fast_ran_at=seen)
    )
    return rows.update(ai_fast_ran_at=now) == 1


def _urgent(organisation, now):
    return (
        SignalThread.objects.filter(organisation=organisation)
        .exclude(urgent_rule="")
        .filter(_new_messages(), last_message_at__gt=now - threads.STALE)
        .filter(Q(claimed_at__isnull=True) | Q(claimed_at__lte=now - CLAIM))
    )


def run_fast_workspace(organisation, *, now):
    from services.work.clock import today_for

    result = FastResult(workspaces=1)
    lane = fast_lane.settings(organisation)
    hour, day = fast_lane.used(organisation, now)
    left = min(lane["per_hour"] - hour, lane["per_day"] - day, fast_lane.MAX_PER_TICK)
    quiet = _urgent(organisation, now).filter(last_message_at__lte=now - fast_lane.QUIET)
    if left <= 0:
        if quiet.exists():
            result.capped = 1
    else:
        today = today_for(organisation, now)
        prefs, profiles = policy_for(organisation), profiles_for(organisation)
        picked = quiet.select_related(
            "customer__owner", "account__owner", "ticket__connector", "organisation"
        ).order_by("last_message_at", "id")[:left]
        for thread in list(picked):
            if not _claim(thread, now):
                continue
            result.threads += 1
            try:
                process(
                    organisation,
                    thread,
                    now=now,
                    today=today,
                    prefs=prefs,
                    profiles=profiles,
                    result=result,
                    lane="fast",
                )
            except Exception as exc:  # noqa: BLE001 - one thread never stops the others (D2-25)
                _failed(thread, thread.last_message_at, now, result, exc)
        _notify(organisation, result, today=today, now=now)
    if result.threads or result.capped:
        audit.record(  # SOC2:LOG-01 counts only, no actor: the schedule ran it (R2D3-20)
            "agent_signals.run",
            actor=None,
            organisation=organisation,
            metadata={**result.counts(), "lane": "fast", "capped": bool(result.capped)},
        )
    return result


def run_fast(*, now=None, organisation=None):
    """Every active workspace with AI and the fast lane on (or just `organisation`)."""
    now = now or timezone.now()
    total = FastResult()
    workspaces = Organisation.objects.filter(
        status=Organisation.Status.ACTIVE, ai_agent_enabled=True, ai_fast_lane__on=True
    ).order_by("id")
    if organisation is not None:
        workspaces = workspaces.filter(pk=organisation.pk)
    for workspace in workspaces:
        if not fast_due(workspace, now) or not claim_fast(workspace, now):
            continue
        try:
            one = run_fast_workspace(workspace, now=now)
        except Exception as exc:  # noqa: BLE001 - one workspace never stops the others
            logger.warning(
                "fast lane: organisation %s failed: %s", workspace.pk, type(exc).__name__
            )
            total.errors.append(f"organisation {workspace.pk}")
            continue
        total.add(one)
        total.capped += one.capped
        total.workspaces += 1
    return total
```

(`from . import fast_lane` at the top; `FastResult` inherits `add` and `counts` from `IntakeResult`. A `workspaces` count of one is only for the command's line.)

- [ ] **Step 5: The command and the loop**

`run_agent_signals.py`: `parser.add_argument("--lane", choices=("interval", "fast", "both"), default="both")`; run `intake.run_all` for `interval`/`both` and `intake.run_fast` for `fast`/`both`; print `fast lane: read {n} thread(s) in {w} workspace(s), {c} capped`. Docstring: "Every 5 minutes … the interval run (each workspace when its interval is due) and the fast lane (R2D3-16)".

`docker-compose.yml` `agentsignals`: the comment says every 5 minutes and both lanes; the loop `sleep 300` and the echo "retrying in five minutes".

- [ ] **Step 6: Run them to see them pass**

Run: `$PY manage.py test services.agents e2e.test_agent_intake_flow e2e.test_agent_round2_flow --parallel auto --noinput`
Expected: OK.

- [ ] **Step 7: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/intake.py services/agents/management/commands/run_agent_signals.py docker-compose.yml services/agents/tests/test_fast_lane_run.py services/agents/tests/test_intake_run.py
git commit -m "feat(agents): the fast lane reads urgent threads after two quiet minutes, within its caps

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: F1, a JSM request type on a Jira step (conditional)

**Gate:** build this task only after the owner reports **LC-F1a** and **LC-F1b** passed (contract §12) and which value form LC-F1b accepted. If they failed or are not done when Task 11 is finished, skip to Task 13, record "F1 not built: documented" in "Changes during the build", and in Task 15 add to `docs/API_CONTRACTS.md` and the PRD: "Jira Service Management: an issue an agent creates has no request type; set one in Jira so it shows in the portal and in request-type queues."

**Files:**
- Modify: `services/connectors/providers/jira.py`, `services/connectors/tests/jira_fake.py`, `services/agents/outside/tools.py`, `services/agents/outside/options.py`, `services/agents/outside/sentences.py`, `services/agents/actions/jira_issues.py`
- Test: `services/agents/tests/test_jira_request_type.py` (create)

**Interfaces:**
- Produces: `JiraProvider.request_types(config, creds, project) -> (rows, note_reason)` (always the connection's host and credentials), `JiraProvider.create_field_id(config, creds, project, type_id, custom)`; `JiraTool.request_types(connector, project)`; list `jira_request_types`; `jira.create` `request_type` (contract §6, R2D3-21).

- [ ] **Step 1: The fake learns JSM**

`FakeJiraApi.__init__`: `self.service_desks = [{"id": "1", "projectKey": "SUP"}]`, `self.request_types = {"1": [{"id": "12", "name": "Report a bug", "issueTypeId": "10002"}, {"id": "13", "name": "Ask a question", "issueTypeId": "10001"}]}`, `self.request_type_field = {"SUP": "customfield_10010"}`. `_route`: `/rest/servicedeskapi/servicedesk` answers `{"values": self.service_desks, "isLastPage": True}`; `/rest/servicedeskapi/servicedesk/<id>/requesttype` answers `{"values": [...], "isLastPage": True}` (404 for an unknown id); the create screen (`/issue/createmeta/{p}/issuetypes/{type}`) adds `{"fieldId": "customfield_10010", "schema": {"custom": "com.atlassian.servicedesk:vp-origin"}}` for a project in `request_type_field`. Record every create's fields (already in `self.created`).

- [ ] **Step 2: Write the failing tests**

```python
"""Round 2 D3 contract §6, R2D3-21 (F1): a Jira step may carry a JSM request
type, listed through the connection whoever acts, and set on POST /issue."""

from services.agents.tests.outside_fixtures import OutsideFixture


class RequestTypeTests(OutsideFixture):
    def test_the_list_reads_the_project_s_request_types_as_the_connection(self):
        bundle, step = self.outside_bundle(self.jira_payload())  # check the helper's real shape
        self.link_for(self.csm)  # Carl acts as himself, the list still reads as the connection
        body = (
            self.client_for(self.csm)
            .get(
                f"/api/v1/agents/bundles/{bundle.pk}/steps/{step.pk}/options/jira_request_types/?project=SUP"
            )
            .json()
        )
        self.assertEqual(
            body["options"],
            [
                {"id": "12", "name": "Report a bug", "detail": "Bug"},
                {"id": "13", "name": "Ask a question", "detail": "Task"},
            ],
        )
        self.assertEqual(self.jira_api.callers[-1], "basic")

    def test_a_software_project_says_so(self):
        bundle, step = self.outside_bundle(self.jira_payload())
        body = (
            self.client_for(self.csm)
            .get(
                f"/api/v1/agents/bundles/{bundle.pk}/steps/{step.pk}/options/jira_request_types/?project=ENG"
            )
            .json()
        )
        self.assertEqual(
            (body["options"], body["note"]), ([], "ENG isn't a Jira Service Management project.")
        )

    def test_run_sets_the_type_and_the_request_type_field(self):
        bundle, step = self.outside_bundle(
            self.jira_payload(request_type={"id": "12", "name": "Report a bug"})
        )
        self.run_all_steps(bundle, self.csm)
        fields = self.jira_api.created[-1]
        self.assertEqual(
            (fields["issuetype"], fields["customfield_10010"]), ({"id": "10002"}, "12")
        )

    def test_no_field_on_the_screen_fails_the_step(self):
        self.jira_api.request_type_field = {}
        bundle, step = self.outside_bundle(
            self.jira_payload(request_type={"id": "12", "name": "Report a bug"})
        )
        result = self.run_all_steps(bundle, self.csm)
        self.assertEqual(
            result["steps"][0]["error"],
            "SUP's create screen has no request type. Remove it, then Retry.",
        )

    def test_without_one_the_create_is_unchanged(self):
        bundle, step = self.outside_bundle(self.jira_payload())
        self.run_all_steps(bundle, self.csm)
        self.assertNotIn("customfield_10010", self.jira_api.created[-1])
```

(Match the helper names to `outside_fixtures.py`: `grep -n "def " services/agents/tests/outside_fixtures.py`. The value `"12"` is the request type id; if LC-F1b found the other form, the provider builds it and this test's expected value changes with it.)

- [ ] **Step 3: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_jira_request_type --parallel auto --noinput`
Expected: FAIL: unknown list `jira_request_types` (404) and no field on the create.

- [ ] **Step 4: The provider**

```python
def _sd(self, config, creds, path, query=None):
    """JSM's API on the site itself, always with the connection's token
    (R2D3-21: no 3LO scope; a person's seat never calls it)."""
    url = f"https://{config['host']}/rest/servicedeskapi{path}"
    if query:
        url += "?" + urlencode(query)
    return http_json("GET", url, headers=self._headers(creds))


def request_types(self, config, creds, project):
    """(rows, None) or ([], "not_service") for the project's request types."""
    desk = None
    start = 0
    for _ in range(4):
        page = self._sd(config, creds, "/servicedesk", {"start": start, "limit": 50})
        desk = next((d for d in page.get("values", []) if d.get("projectKey") == project), None)
        if desk or page.get("isLastPage", True):
            break
        start += 50
    if desk is None:
        return [], "not_service"
    page = self._sd(
        config, creds, f"/servicedesk/{quote(str(desk['id']), safe='')}/requesttype", {"limit": 100}
    )
    rows = [
        {
            "id": str(r["id"]),
            "name": r.get("name") or "",
            "issue_type_id": str(r.get("issueTypeId") or ""),
        }
        for r in page.get("values", [])
    ]
    return rows, None


def create_field_id(self, config, creds, project, type_id, custom):
    """The create screen's field id whose schema.custom is `custom`, or None
    (the same paged read `create_priorities` makes)."""
```

(`create_field_id` reuses the paging of `create_priorities` (200 a page, at most 3 pages): factor the page loop into `_create_fields(config, creds, project, type_id)` and have both read it.) Errors: a 401/403 from `_sd` maps to the note reason `"refused"`; a timeout or 5xx is the list's existing `TOOL_UNREACHABLE`.

- [ ] **Step 5: The list, the edit and the run**

- `options.py`: `LISTS[K.JIRA_CREATE]` gains `"jira_request_types"`; it requires `project` (else the step's own); it calls `JiraTool.request_types(connector, project)` with the **connection's seat** regardless of the reader's link (comment `# R2D3-21: listed as the connection; a link's classic scopes can't read JSM`); rows get `detail` from the project's issue types (`issue_types` read once, as the connection); notes from contract §6.
- `jira_issues.py`: `editable` adds `"request_type"`; `edit` accepts it through `pick(..., nullable=True)`; a project change sets `clean["request_type"] = None`; `preview` adds `"request_type": (payload.get("request_type") or {}).get("name")`.
- `_fields`, when `payload["request_type"]` is set: read `tool.request_types(connector, project)` (connection seat), find the id (else `Refused(sentences.request_type_gone(project, name))`), set `issuetype` to its `issue_type_id`, read `create_field_id(..., "com.atlassian.servicedesk:vp-origin")` with the step's seat (else `Refused(sentences.no_request_field(project))`), and set `fields[field_id] = <value per LC-F1b>`. A Jira 400 whose `errors` names that field id → `Refused(sentences.request_type_refused())`.
- `sentences.py`: the three sentences of contract §6, word for word.

- [ ] **Step 6: Run them to see them pass**

Run: `$PY manage.py test services.agents.tests.test_jira_request_type services.agents.tests.test_jira_create_kind services.agents.tests.test_jira_as_person services.agents.tests.test_outside_queries --parallel auto --noinput`
Expected: OK (`OPTIONS_QUERIES` unchanged: the new list makes no more database reads than `jira_issue_types`).

- [ ] **Step 7: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/connectors/providers/jira.py services/connectors/tests/jira_fake.py services/agents/outside/tools.py services/agents/outside/options.py services/agents/outside/sentences.py services/agents/actions/jira_issues.py services/agents/tests/test_jira_request_type.py
git commit -m "feat(agents): a Jira step can carry a service project's request type

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Query ceilings

**Files:**
- Create: `services/work/tests/test_unmatched_queries.py`
- Modify: `services/agents/tests/test_intake_queries.py`, `services/work/tests/test_queue_bundles.py` (or wherever `QUEUE_QUERIES` lives: `grep -rn "QUEUE_QUERIES = " services`), `services/agents/tests/test_fast_lane_run.py`, `services/agents/tests/test_fast_lane_settings.py`

**Interfaces:**
- Produces: `UNMATCHED_LIST_QUERIES`, `UNMATCHED_MATCH_QUERIES`, `SETTINGS_QUERIES`, `FAST_TICK_QUERIES`; `THREAD_RUN_QUERIES` and `QUEUE_QUERIES` re-measured (contract R2D3-23, §9).

- [ ] **Step 1: The tests**

`test_unmatched_queries.py` (an `IntakeFixture`, with the `no_distinct` helper from `test_intake_queries.py`):

```python
UNMATCHED_LIST_QUERIES = 0  # measured in Step 2
UNMATCHED_MATCH_QUERIES = 0


class UnmatchedQueryTests(IntakeFixture):
    def measure(self, user, call):
        call()  # warm (sessions, workspace rows)
        with CaptureQueriesContext(connection) as queries:
            call()
        no_distinct(self, queries)
        return len(queries)

    def test_the_list_is_constant_in_its_rows(self):
        jira = self.connector("jira", "cs")
        item(jira)
        client = self.client_for(self.csm)
        few = self.measure(
            self.csm, lambda: client.get("/api/v1/work/unmatched/?queue=department:cs")
        )
        for n in range(30):
            item(jira, requester_email=f"p{n}@newco.io")
        many = self.measure(
            self.csm, lambda: client.get("/api/v1/work/unmatched/?queue=department:cs")
        )
        self.assertEqual(few, many)
        self.assertEqual(many, UNMATCHED_LIST_QUERIES)

    def test_a_match_costs_a_fixed_number(self):
        jira = self.connector("jira", "cs")
        rows = [item(jira), item(jira, requester_email="bo@newco.io")]
        client = self.client_for(self.csm)
        client.get("/api/v1/work/unmatched/?queue=department:cs")  # warm
        counts = []
        for row in rows:
            with CaptureQueriesContext(connection) as queries:
                response = client.post(
                    f"/api/v1/work/unmatched/{row.pk}/match/",
                    {"customer_id": self.pizza.pk, "add_contact": True},
                    format="json",
                )
            self.assertEqual(response.status_code, 200)
            no_distinct(self, queries)
            counts.append(len(queries))
        self.assertEqual(counts[0], counts[1])
        self.assertEqual(counts[1], UNMATCHED_MATCH_QUERIES)
```

`FAST_TICK_QUERIES`: `intake.run_fast()` for a workspace with the lane on and nothing urgent (the cost every 5 minutes): pin it and assert it equals the count with 10 non-urgent threads waiting. `SETTINGS_QUERIES`: `GET /agents/settings/` as Alice, equal with 1 and 5 Slack connectors.

- [ ] **Step 2: Measure and pin**

Run: `$PY manage.py test services.work.tests.test_unmatched_queries services.agents.tests.test_intake_queries services.agents.tests.test_fast_lane_run services.agents.tests.test_fast_lane_settings services.work --parallel auto --noinput`
Expected: the new pins print their counts on the first run (set each constant to the printed number); `THREAD_RUN_QUERIES` at most 34; each `QUEUE_QUERIES` entry at most its old value plus the number of routed queues that reader sees (1 for Carl). A count that grows with rows is a bug: fix the code (a per-row connector or contact read), not the pin.

- [ ] **Step 3: Record and commit**

Add to the contract's "Changes during the build": "Measured ceilings (Task 13): `UNMATCHED_LIST_QUERIES = <n>`, `UNMATCHED_MATCH_QUERIES = <n>`, `SETTINGS_QUERIES = <n>`, `FAST_TICK_QUERIES = <n>`, `THREAD_RUN_QUERIES = <n>`, `QUEUE_QUERIES = {…}`. No query uses DISTINCT."

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/work/tests/test_unmatched_queries.py services/agents/tests/test_intake_queries.py services/agents/tests/test_fast_lane_run.py services/agents/tests/test_fast_lane_settings.py services/work/tests docs/superpowers/plans/2026-10-14-agent-bundles-r2d3-api.md
git commit -m "test(agents): pin the ceilings for unmatched items and the fast lane

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: The end-to-end journey

**Files:**
- Create: `e2e/test_agent_round2_intake_flow.py`

**Interfaces:**
- Consumes: everything above, over real HTTP (`e2e/http.py`), with `Round2World` (`e2e/agent_round2_world.py`).

- [ ] **Step 1: Write the journey**

```python
"""End-to-end tier: real server, real HTTP, real test DB; Slack and Jira are
fakes (their APIs in memory), the model is a fake. Nothing leaves the
process.

Journey (round 2 D3): Ann, whom no customer knows, writes in Alfee's synced
Slack support channel. The sync keeps her message; Carl (CS) sees it under
"Needs a customer" in the CS queue with a count on the rail, matches it to
Pizza Hut and adds Ann as a contact; the interval run reads the thread and
proposes a bundle. Alice switches the fast lane on with the word "outage";
Ann writes again ("Total outage"), now matched by herself, and the fast tick
reads it two quiet minutes later, its call marked fast_lane. A colleague's
message in the same channel is never kept. A second unknown message is
dismissed and its text is gone."""

from datetime import timedelta
from unittest.mock import patch

from django.core.management import call_command
from django.test import LiveServerTestCase
from django.utils import timezone

from core.models import AuditEvent
from e2e.agent_round2_world import Round2World
from e2e.http import http_get, http_patch, http_post
from services.agents.models import AgentBundle, SignalThread
from services.connectors.models import UnmatchedItem
from services.copilot.models import ModelCall
from services.customers.models import Contact, Ticket


class WiderIntakeFlowTests(Round2World, LiveServerTestCase):
    def test_a_stranger_is_matched_then_read_fast(self):
        world = self.world()  # Alice, Carl, Pizza Hut, a CS Slack connector syncing C0SUPPORT
        self.say("U9", "ann@newco.io", "Ann Lee", "Our exports fail since the update.")
        self.say("U2", "dana@acme.io", "Dana CSM", "I'll look at it.")  # a colleague
        call_command("sync_tickets")
        carl = self.login("carl@acme.io")

        status, rail = http_get(self.api("/work/queues/"), carl)
        cs = next(row for row in rail["queues"] if row["key"] == "department:cs")
        self.assertEqual(cs["needs_customer"], 1)
        status, listed = http_get(self.api("/work/unmatched/?queue=department:cs"), carl)
        [ann] = listed["items"]
        self.assertEqual(ann["from"]["email"], "ann@newco.io")

        status, body = http_post(
            self.api(f"/work/unmatched/{ann['id']}/match/"),
            {"customer_id": world.pizza.pk, "add_contact": True},
            token=carl,
        )
        self.assertEqual(status, 200, body)
        self.assertTrue(Contact.objects.filter(email="ann@newco.io", customer=world.pizza).exists())
        thread = SignalThread.objects.get(ticket=Ticket.objects.get(pk=body["ticket"]["id"]))
        self.read_after_quiet(thread, lane="interval")
        self.assertTrue(AgentBundle.objects.filter(thread=thread).exists())

        alice = self.login("alice@acme.io")
        status, _ = http_patch(
            self.api("/agents/settings/"),
            {"fast_lane": {"on": True, "rules": {"words": ["outage"]}}},
            token=alice,
        )
        self.assertEqual(status, 200)
        self.say("U9", "ann@newco.io", "Ann Lee", "Total outage now, nobody can log in.")
        call_command("sync_tickets")
        urgent = SignalThread.objects.exclude(urgent_rule="").get()
        self.assertEqual(urgent.urgent_rule, "word")
        self.read_after_quiet(urgent, lane="fast", minutes=3)
        self.assertTrue(self.model_calls_marked_fast)

        self.say("U8", "bob@unknown.io", "Bob", "Spam spam spam.")
        call_command("sync_tickets")
        bob = UnmatchedItem.objects.get(requester_email="bob@unknown.io")
        status, _ = http_post(self.api(f"/work/unmatched/{bob.pk}/dismiss/"), {}, token=carl)
        bob.refresh_from_db()
        self.assertEqual((bob.status, bob.excerpt), ("dismissed", ""))
        self.assertEqual(UnmatchedItem.objects.filter(requester_email="dana@acme.io").count(), 0)
        self.assertEqual(
            set(AuditEvent.objects.values_list("action", flat=True))
            >= {"ticket.matched", "unmatched.dismissed", "agents.settings_update"},
            True,
        )
```

Helpers to write in the class (copy from `e2e/test_agent_round2_flow.py` and `agent_round2_world.py`): `world()` (the workspace, people, logins, a Slack connector on department `cs` syncing `C0SUPPORT`, Pizza Hut owned by Carl), `say(user, email, name, text)` (adds a message to `self.slack.channels["C0SUPPORT"]` with a fresh `ts` and the user's profile email in the fake's users), `login(email)`, `api(path)`, and `read_after_quiet(thread, lane, minutes=20)`: move the thread's `last_message_at` back by `minutes`, then call `run_agent_signals --lane <lane>` with `get_completion` patched to a `note.create` answer (as the world does) and set `self.model_calls_marked_fast` to whether the patched call got `scope_key="fast_lane"` (the patched model writes no `ModelCall` row, so the journey reads the mock's kwargs; `ModelCall` is then an unused import: drop it). Note: a Slack message is one thread per message (`external_id = <connector>:<ts>`), so Ann's second message is a new thread that matches Pizza Hut by itself through the contact added above.

- [ ] **Step 2: Run it**

Run: `$PY manage.py test e2e.test_agent_round2_intake_flow e2e.test_agent_round2_flow e2e.test_agent_intake_flow --parallel auto --noinput`
Expected: OK. A failure shows a real gap in Tasks 1 to 13: fix it there (test first), not in the journey.

- [ ] **Step 3: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add e2e/test_agent_round2_intake_flow.py
git commit -m "test(e2e): round 2 D3 journey: match a stranger's message, then read it in the fast lane

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: SOC 2, the docs, the full suite and the hand-off

**Files:**
- Modify: `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/data-classification.md`, `docs/product/01-prd.md`, `docs/product/02-trd.md`, `docs/product/05-backend-schema.md`, `docs/product/06-implementation-plan.md`, `.soc2/CONTROL_MAP.md`, the intake flow doc in `.agents/workflows/`, `docs/superpowers/plans/2026-10-14-agent-bundles-r2d3-api.md` ("Changes during the build")

- [ ] **Step 1: `API_CONTRACTS.md`** (the `api-contracts` skill): in `work`, the three `/work/unmatched/` routes (contract §3, every answer and sentence) and the rail's `needs_customer` (§4); in `agents`, `signals.fast_lane` and the `fast_lane` PATCH with its sentences (§5), `--lane` and the 5-minute loop, and F1's list, field, preview and step errors (§6) or the F1 note if it was not built; in `connectors`, the F2/F3 audit rows; the measured ceilings.

- [ ] **Step 2: Audit, SOC 2, data, product docs, flow doc**

- `docs/audit-events.md`: `ticket.matched`, `unmatched.dismissed`, `unmatched.purged`, `connector.update`, `connector.create`, `connector.delete` (contract §7); `agent_signals.run`'s `lane` and `capped`.
- `docs/data-classification.md`: `connectors.UnmatchedItem` (Confidential: outside message text and a sender's name and email; 30-day retention; blanked on dismiss).
- `.soc2/CONTROL_MAP.md`: AUTH-02 (unmatched items by queue; matching needs an openable, covered record), LOG-01 (the six events), DATA-04 (the 30-day purge, `services/connectors/unmatched.py:purge`, run by `sync_tickets`), DATA-06 (the excerpt cap, nothing in logs or audit), CHG or OPS as the map names it for the connector audit (F2).
- `docs/product/01-prd.md`: "Needs a customer" (who sees it, matching, add as contact, dismiss, 30 days); the fast lane (rules, caps, credits, off by default); round 2 D3 done. `02-trd.md`: `unmatched.py`, `fast_lane.py`, `run_fast`, the 5-minute loop. `05-backend-schema.md`: the three migrations. `06-implementation-plan.md`: R2-D3 done; production needs the `agentsignals` service (contract §13).
- The intake flow doc (`flow-docs` skill): where an unmatched item is kept, matched and purged; how a thread becomes urgent and when the fast tick reads it.

- [ ] **Step 3: The full gate**

```bash
$PY manage.py test --parallel auto --noinput
$PY manage.py makemigrations --check --dry-run
$PY manage.py spectacular --file /tmp/r2d3-schema.yml --validate
venv/bin/ruff check . && venv/bin/ruff format --check .
```

Expected: every test OK (write the count into the hand-off), "No changes detected", the schema written without errors, ruff clean. (Mac hang: see Global Constraints.)

- [ ] **Step 4: Commit and push**

```bash
git add docs/API_CONTRACTS.md docs/audit-events.md docs/data-classification.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md docs/product/06-implementation-plan.md .soc2/CONTROL_MAP.md .agents/workflows docs/superpowers/plans/2026-10-14-agent-bundles-r2d3-api.md
git commit -m "docs: round 2 delivery 3 in the contracts, audit events, SOC 2 map and product docs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push origin feat/agent-bundles-r2d3
```

Hand-off (to the controller, not a PR): the head, the suite count, the three migrations, the measured ceilings, whether F1 was built, every "Changes during the build" entry, and the owner set-up and live checks (contract §12, §13), above all the missing production `agentsignals` service.

---

## Self-review

1. **Contract coverage.** R2D3-1 Global Constraints, Task 2 (`SOURCES`); R2D3-2 Tasks 2, 3, 5; R2D3-3 Task 2 (`EXCERPT_CHARS`, `_text`); R2D3-4 Task 2 (plain columns, the model comment); R2D3-5 Task 2 (`_keepable`, the cap); R2D3-6 Tasks 2, 3; R2D3-7 Task 4 (`waiting_in`), Tasks 5, 6 (`readable`); R2D3-8 Task 5; R2D3-9 Task 5 (`touch_ticket` without `first_seen`, no model patch called); R2D3-10 Task 6; R2D3-11 Task 7; R2D3-12 Task 8; R2D3-13 to R2D3-15 Task 10; R2D3-16 to R2D3-18 Task 11 (caps), Task 9 (`used`); R2D3-19 Task 9; R2D3-20 Tasks 1, 5, 6, 7, 11; R2D3-21 Task 12; R2D3-22 Task 1; R2D3-23 Task 13; R2D3-24 unchanged read paths (Task 3 asserts no thread and no model at sync). Contract §2 Tasks 2, 3; §3 Tasks 4 to 6; §4 Task 8; §5 Tasks 9 to 11; §6 Task 12; §7 the tasks above; §9 Task 13; §13 infra in the hand-off.
2. **Placeholders.** Code steps hold their code. Notes that ask the implementer to look up an existing helper's real name (the Jira connector's credential keys, `inbound`'s arguments, the e2e world helpers, `outside_fixtures` helpers, `AuditEvent`'s target field, the intake flow doc's file name) each name the `grep` or the file to copy from. Task 12 is gated on the owner's live checks and says what to do if they fail.
3. **Type consistency.** `UnmatchedItem` (Task 2) is what `keep`, `page`, `match`, `dismiss`, `purge` read; `unmatched.Refused(status, body)` (Task 5) is what the views map; `queue_of(row)` and `waiting_in(reader, key)` (Task 4) feed `readable` (Task 5) and `count` (Task 8). `fast_lane.settings(organisation)` (Task 9) is what `rule_for` (Task 10) and `run_fast_workspace` (Task 11) read; `fast_lane.used` (Task 9) is what the caps read; `SCOPE_KEY` (Task 9) is what `process(lane="fast")` passes (Task 11) and `used` counts.
