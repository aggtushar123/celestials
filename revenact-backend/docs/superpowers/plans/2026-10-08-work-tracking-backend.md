# Work, delivery 3 ("tracking that pushes"): backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Work's "today" follows each workspace's timezone and working days; a daily pass nudges assignees about overdue tasks and escalates them once to a manager; a once-a-day email digest is built, sent by the minute runner and safely skipped while the server has no SMTP; Settings › Work gets the fields for all of it.

**Architecture:** `services/work/clock.py` becomes the one place that knows a workspace's timezone and working days (every Work route already asks it for "today"). `services/work/tracking.py` is the nudge and escalation pass, called from `run_health_maintenance` next to the recommender. `services/work/digest.py` builds and sends the digest, called from `deliver_pending` (the `sender` service, every 60 s), with a `DigestSend(user, local_date)` row claimed before each send so nobody gets two. `task_changes.record_changes` re-arms escalation when a task is reassigned, re-dated or re-opened. No new routes: `GET/PATCH /work/settings/` and `GET/PATCH /auth/me/` gain fields.

**Tech Stack:** Django 5, DRF, PostgreSQL (CI and prod 16, local 15), `zoneinfo`, Django's mail API, Channels notifications (`services.notifications.realtime.notify`).

**Spec:** react-ts-app `docs/superpowers/specs/2026-10-07-work-round-design.md` §3 (and §4 to §6 as they apply to delivery 3). **API contract (binding):** `docs/superpowers/plans/2026-10-08-work-tracking-api.md`. Delivery 2's backend plan (`docs/superpowers/plans/2026-10-07-work-recommended-backend.md`) is the house style. Read the spec section and the contract with this plan.

## Global Constraints

- **Worktree and branch.** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-trk-be`, branch `feat/work-tracking`, based on `main` (`1ecccdf`, delivery 1 and 2 merged). It has its own `venv` (untracked; never commit it). Always `git add <explicit paths>`, never `git add -A` or `git add .`. **Never use `git stash`** (the stash stack is shared across worktrees).
- **Commands.** `venv/bin/python manage.py test <labels> --parallel auto --noinput`; `venv/bin/python manage.py makemigrations <app>`; `venv/bin/ruff check .` and `venv/bin/ruff format --check .` (ruff formats Python inside Markdown fences too: keep doc code blocks formatted). Use `venv/bin/python -m pip`, not `venv/bin/pip`.
- **Every commit message** is a conventional commit (`feat(work): ...`, `test(work): ...`, `docs: ...`) and ends with exactly this line: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Postgres 16:** no join made unique with `.distinct()` anywhere. Filter with `id__in` subqueries. `services/work/tests/test_queries.py` gains the new modules (Task 8).
- **The twice-filter:** anything a person reads (the digest's counts and items) goes through `today.build` and `rec_access.decidable` + `rec_access.openable`, never a fresh query.
- **Counted, not named:** a notification or digest names a record only to a recipient who may open it (`scoping.can_open`); otherwise it uses the contract's generic sentence.
- **SOC 2 markers:** every access decision carries a `# SOC2:AUTH-02 ...` comment as the existing Work code does; every settings write keeps its `audit.record("work.settings_update", ...)` (`# SOC2:LOG-01`). A logged exception logs its class name only (`type(exc).__name__`): its text can quote a row's values.
- **Jobs never fail each other:** each workspace, and each person in the digest, fails on its own; the job's caller wraps the whole call in `try/except Exception` and reports, as the neighbouring steps in `run_health_maintenance` and `deliver_pending` do.
- **Migrations:** `work 0002`, `customers 0057`, `notifications 0009`, `accounts 0014`. Generate with `makemigrations`, never hand-number. The local dev DB is shared with other worktrees: run `migrate` only when the task says so.
- **Docs in the same PR:** `docs/API_CONTRACTS.md` (api-contracts skill) and the backend product docs `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md` (Task 8).
- **Out of scope:** the frontend; account-settings UI for `digest_opt_out`; production SMTP; Brain and other sections' "today" (only Work moves to the workspace timezone).

## Decisions (where the spec leaves a choice)

1. **"Overdue" stays delivery 1's** (`states.overdue_q`): past due and not Blocked. A Blocked task is neither nudged nor escalated; it waits on its reason.
2. **Tasks with no assignee** (seeded demo tasks with only `assignee_name`) are neither nudged nor escalated: there is nobody to remind, and escalating every seeded task would flood the owner.
3. **A deactivated assignee** is not nudged and escalates on the first working-day pass after the task is overdue, whatever `escalate_after_days` says (spec §5 "straight to the manager").
4. **The escalation recipient** is the assignee's `reports_to` when that person is active and in the same workspace, else the workspace's owner (`identity.ownership.owner_membership`) when active. If that is the assignee themself, or nobody, the task is marked escalated with no notification and no event (nobody is above them; it is not retried daily).
5. **Once only, under concurrency:** a nudge goes once per workspace-local day (claim: `last_nudged_at` before the start of the local day), through a conditional `UPDATE ... WHERE last_nudged_at IS NULL OR last_nudged_at < start of the local day` (this replaced the 24-hour window after review), an escalation with `UPDATE ... WHERE escalated_at IS NULL`; only a claim that changed one row notifies. Two overlapping runs never notify twice.
6. **Re-arming** (spec §3.2, §5): `record_changes` clears `escalated_at` when the change includes the assignee or the due date, or moves the status from completed to anything else. It writes no event of its own. `last_nudged_at` is left alone (the once-per-local-day spacing protects the person, not the task).
7. **`email_ready`** is false when `settings.EMAIL_BACKEND` is Django's console or dummy backend. The locmem backend (Django's test default) counts as ready, so tests read `mail.outbox`. This is what the spec's "console or locmem in production" means in practice: prod with no SMTP runs the console backend (`config/settings.py`).
8. **The digest's moment:** a workspace's local time has reached `digest_hour` on one of its working days. A workspace with no `WorkSettings` row has the defaults (digest on, 08:00 UTC, Monday to Friday) and gets one (`prefs.settings_for`).
9. **At most once per person per local date:** the `DigestSend` row is claimed (inserted) before building or sending. A failed send is marked `failed` and not retried that day; nothing to report is marked `empty`. Without `email_ready` nothing is claimed (so the day's digest still goes out if SMTP appears later that day), and "email isn't set up; digests skipped" is logged once per process.
10. **The digest's recommendations count** is `rec_access.openable(reader, rec_access.decidable(reader, default_scope(reader))).count()`: the badge's number for that reader, without building 100 rows.
11. **Working days passed to defaults:** `defaults.default_due` takes the workspace's working days so Assign's "three working days" prefill follows Settings. `recommendations.build` and `deciding.assign` read them once per call (`clock.working_days_for`).
12. **`recommendations_waiting`'s "told today"** compares with the start of the workspace's local day (`clock.start_of_day`), not `created_at__date`.

---

### Task 1: The workspace clock (timezone, working days)

**Files:**
- Modify: `services/work/models.py` (WorkSettings fields)
- Create: `services/work/migrations/0002_work_tracking_settings.py` (generated)
- Modify: `services/work/clock.py`
- Modify: `services/work/defaults.py:23-37`, `services/work/recommendations.py:98,104-116`, `services/work/deciding.py:87-106`
- Modify: `services/work/recommend.py:242-315` (`refresh_all`, `notify_waiting`)
- Modify: `services/customers/management/commands/run_health_maintenance.py` (the recommender call)
- Test: `services/work/tests/test_clock.py` (new)

**Interfaces:**
- Produces (later tasks rely on these exact names):
  - `WorkSettings.timezone: str`, `.working_days: list[int]`, `.escalate_after_days: int`, `.digest_enabled: bool`, `.digest_hour: int`
  - `clock.WORKING_DAYS = (0, 1, 2, 3, 4)`
  - `clock.zone(prefs) -> ZoneInfo`, `clock.zone_for(organisation) -> ZoneInfo`
  - `clock.local_now(organisation, now=None) -> datetime` (aware, in the workspace zone)
  - `clock.today_for(organisation, now=None) -> date`
  - `clock.working_days_for(organisation) -> tuple[int, ...]`
  - `clock.start_of_day(organisation, day) -> datetime` (aware)
  - `clock.add_working_days(day, count, working=WORKING_DAYS) -> date`
  - `clock.working_days_between(start, end, working=WORKING_DAYS) -> int` (working days `d` with `start < d <= end`)
  - `recommend.refresh_all(organisation=None, *, today=None, actor=None)`: `today=None` means each workspace's own today.

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_clock.py`:

```python
"""Work's clock (spec §3.2 Timezone): "today" and working days are the
workspace's own."""

from datetime import UTC, date, datetime
from unittest.mock import patch

from services.accounts.models import Organisation
from services.notifications.models import Notification
from services.work import clock
from services.work.models import WorkSettings
from services.work.prefs import settings_for
from services.work.recommend import notify_waiting
from services.work.tests.recommend_fixtures import RecommendFixture

# Wednesday 7 Oct 2026, 20:00 UTC: already Thursday 8 Oct in Kolkata (UTC+5:30).
LATE_WEDNESDAY = datetime(2026, 10, 7, 20, 0, tzinfo=UTC)
FRI, SAT, SUN, MON, TUE = (date(2026, 10, d) for d in (9, 10, 11, 12, 13))


class ClockTests(RecommendFixture):
    def org(self):
        return Organisation.objects.get(pk=self.org.pk)

    def test_today_is_utc_by_default(self):
        self.assertEqual(clock.today_for(self.org(), LATE_WEDNESDAY), date(2026, 10, 7))

    def test_today_follows_the_workspace_timezone(self):
        self.prefer(timezone="Asia/Kolkata")
        self.assertEqual(clock.today_for(self.org(), LATE_WEDNESDAY), date(2026, 10, 8))

    def test_an_unknown_stored_timezone_reads_as_utc(self):
        self.prefer(timezone="Mars/Olympus")
        self.assertEqual(clock.today_for(self.org(), LATE_WEDNESDAY), date(2026, 10, 7))

    def test_start_of_day_is_local_midnight(self):
        self.prefer(timezone="Asia/Kolkata")
        start = clock.start_of_day(self.org(), date(2026, 10, 8))
        self.assertEqual(start.astimezone(UTC), datetime(2026, 10, 7, 18, 30, tzinfo=UTC))

    def test_working_days_default_to_monday_to_friday(self):
        self.assertEqual(clock.working_days_for(self.org()), (0, 1, 2, 3, 4))
        self.prefer(working_days=[6, 0, 1, 2, 3])
        self.assertEqual(clock.working_days_for(self.org()), (0, 1, 2, 3, 6))

    def test_add_working_days_skips_the_weekend(self):
        self.assertEqual(clock.add_working_days(FRI, 1), MON)
        self.assertEqual(clock.add_working_days(FRI, 2), TUE)
        self.assertEqual(clock.add_working_days(FRI, 1, (0, 1, 2, 3, 4, 5, 6)), SAT)

    def test_add_working_days_with_no_working_days_uses_the_default(self):
        self.assertEqual(clock.add_working_days(FRI, 1, ()), MON)

    def test_working_days_between_counts_after_start_up_to_end(self):
        self.assertEqual(clock.working_days_between(FRI, SAT), 0)
        self.assertEqual(clock.working_days_between(FRI, MON), 1)
        self.assertEqual(clock.working_days_between(FRI, TUE), 2)
        self.assertEqual(clock.working_days_between(SUN, MON), 1)
        self.assertEqual(clock.working_days_between(MON, MON), 0)
        self.assertEqual(clock.working_days_between(FRI, SUN, (5, 6)), 2)

    def test_the_today_route_uses_the_workspace_date(self):
        self.prefer(timezone="Asia/Kolkata")
        with patch("django.utils.timezone.now", return_value=LATE_WEDNESDAY):
            data = self.ok(self.csm, "/api/v1/work/today/")
        self.assertEqual(data["today"], "2026-10-08")

    def test_assign_defaults_use_the_workspace_working_days(self):
        self.prefer(working_days=[0, 1, 2, 3, 4, 5, 6])
        self.make_rec("overdue_tasks", on=self.pizza, recipient=self.mona, suggested=self.csm)
        today = clock.today_for(self.org())
        data = self.ok(self.mona, "/api/v1/work/recommendations/?scope=me")
        due = data["items"][0]["defaults"]["due_date"]
        self.assertEqual(due, clock.add_working_days(today, 3, (0, 1, 2, 3, 4, 5, 6)).isoformat())

    def test_told_today_is_the_workspace_day(self):
        """A notice sent yesterday (local) does not count as today's, even
        on the same UTC date."""
        self.prefer(timezone="Asia/Kolkata")
        rec = self.make_rec(on=self.pizza, recipient=self.mona, suggested=self.csm)
        earlier = Notification.objects.create(
            recipient=self.mona, kind=Notification.Kind.RECOMMENDATIONS_WAITING, message="x"
        )
        # 7 Oct 10:00 UTC is still 7 Oct in Kolkata; LATE_WEDNESDAY is 8 Oct there.
        Notification.objects.filter(pk=earlier.pk).update(
            created_at=datetime(2026, 10, 7, 10, 0, tzinfo=UTC)
        )
        told = notify_waiting([rec], today=date(2026, 10, 8))
        self.assertEqual(told, 1)

    def test_told_today_still_holds_within_the_local_day(self):
        self.prefer(timezone="Asia/Kolkata")
        rec = self.make_rec(on=self.pizza, recipient=self.mona, suggested=self.csm)
        earlier = Notification.objects.create(
            recipient=self.mona, kind=Notification.Kind.RECOMMENDATIONS_WAITING, message="x"
        )
        Notification.objects.filter(pk=earlier.pk).update(
            created_at=datetime(2026, 10, 7, 19, 0, tzinfo=UTC)
        )
        self.assertEqual(notify_waiting([rec], today=date(2026, 10, 8)), 0)

    def test_settings_rows_get_the_defaults(self):
        prefs = settings_for(self.org())
        self.assertEqual(
            (prefs.timezone, prefs.working_days, prefs.escalate_after_days),
            ("UTC", [0, 1, 2, 3, 4], 2),
        )
        self.assertEqual((prefs.digest_enabled, prefs.digest_hour), (True, 8))
        self.assertIsInstance(WorkSettings._meta.get_field("working_days").default(), list)
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.work.tests.test_clock --parallel auto --noinput`
Expected: errors (`prefer(timezone=...)` fails: no such field; `clock.start_of_day` missing).

- [ ] **Step 3: Add the settings fields**

In `services/work/models.py`, above `class WorkSettings`, add:

```python
def default_working_days():
    """Monday (0) to Friday (4)."""
    return [0, 1, 2, 3, 4]
```

In `WorkSettings`, replace the docstring's last sentence ("Delivery 3 adds its own columns here (timezone, working days, escalation, digest).") with:

```python
    """...`timezone` (an IANA name) and `working_days` (weekday numbers,
    Monday 0) are what "today" and "a working day" mean for every Work list
    (`clock`); `escalate_after_days` is how many working days overdue a task
    escalates (`tracking`); `digest_enabled` and `digest_hour` (local) are
    the daily email (`digest`)."""
```

and add these fields after `dismiss_cooldown_days`:

```python
    timezone = models.CharField(max_length=64, default="UTC")
    working_days = models.JSONField(default=default_working_days, blank=True)
    escalate_after_days = models.PositiveSmallIntegerField(default=2)
    digest_enabled = models.BooleanField(default=True)
    digest_hour = models.PositiveSmallIntegerField(default=8)
```

Run: `venv/bin/python manage.py makemigrations work --name work_tracking_settings`
Expected: `services/work/migrations/0002_work_tracking_settings.py` with five `AddField`s.

- [ ] **Step 4: Rewrite the clock**

Replace `services/work/clock.py` with:

```python
"""What "today" and "a working day" are for a workspace's Work lists (spec
§3.2 Timezone): the date in the workspace's own timezone, and its own
working days (`WorkSettings`). Every Work route, job and default asks here.
Brain and the other sections keep the server's date."""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone

#: Monday (0) to Friday (4).
WORKING_DAYS = (0, 1, 2, 3, 4)
UTC_ZONE = ZoneInfo("UTC")


def _prefs(organisation):
    from .prefs import settings_for

    return settings_for(organisation)


def zone(prefs):
    """The settings' timezone; UTC for a name this server does not know."""
    try:
        return ZoneInfo(prefs.timezone or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return UTC_ZONE


def zone_for(organisation):
    return zone(_prefs(organisation))


def local_now(organisation, now=None):
    return (now or timezone.now()).astimezone(zone_for(organisation))


def today_for(organisation, now=None):
    return local_now(organisation, now).date()


def working(prefs):
    """The settings' working days as a sorted tuple; the default if none."""
    days = prefs.working_days if isinstance(prefs.working_days, list) else []
    return tuple(sorted({d for d in days if isinstance(d, int) and 0 <= d <= 6})) or WORKING_DAYS


def working_days_for(organisation):
    return working(_prefs(organisation))


def start_of_day(organisation, day):
    """The instant `day` begins in the workspace's timezone."""
    return datetime.combine(day, time.min, tzinfo=zone_for(organisation))


def add_working_days(day, count, working_days=WORKING_DAYS):
    """`count` working days after `day`; `day` itself never counts."""
    days = working_days or WORKING_DAYS
    while count > 0:
        day += timedelta(days=1)
        if day.weekday() in days:
            count -= 1
    return day


def working_days_between(start, end, working_days=WORKING_DAYS):
    """How many working days `d` there are with `start < d <= end`."""
    days = working_days or WORKING_DAYS
    count, day = 0, start
    while day < end:
        day += timedelta(days=1)
        if day.weekday() in days:
            count += 1
    return count
```

- [ ] **Step 5: Pass working days to the Assign defaults**

In `services/work/defaults.py`, change `default_due` and `defaults` to take the working days:

```python
from .clock import WORKING_DAYS, add_working_days
```

```python
def default_due(rec, today, working_days=WORKING_DAYS):
    """A week before the renewal; the AI agent's own date; otherwise three
    working days away (the workspace's working days). Never before today."""
    ...  # the two early returns unchanged
    return add_working_days(today, WORKING_DAYS_TO_DO, working_days)
```

```python
def defaults(rec, today, working_days=WORKING_DAYS):
    return {
        "title": rec.title,
        "due_date": default_due(rec, today, working_days).isoformat(),
        "priority": default_priority(rec),
    }
```

In `services/work/recommendations.py`: `row_payload(rec, *, today, opens)` gains `working_days` and passes it (`"defaults": defaults(rec, today, working_days)`); in `build`, read the days once and pass them:

```python
from .clock import working_days_for
```

```python
def build(reader, scope, *, today):
    waiting = decidable(reader, scope)
    # SOC2:AUTH-02 named only on records the reader may open; the rest counted
    readable = openable(reader, waiting)
    count = readable.count()
    rows = list(readable.select_related(*LIST_RELATED).order_by("-created_at", "-id")[:LIMIT])
    opens = Opens(rows)
    days = working_days_for(reader.organisation)
    return {
        "scope": scope,
        "items": [row_payload(rec, today=today, opens=opens, working_days=days) for rec in rows],
        "count": count,
        "hidden": waiting.count() - count,
    }
```

(`grep -n "row_payload(" services/work` and update every caller the same way.)

In `services/work/deciding.py:106`, replace `due = due_date or default_due(rec, today)` with:

```python
    due = due_date or default_due(rec, today, working_days_for(rec.organisation))
```

and add `from .clock import working_days_for` to its imports.

- [ ] **Step 6: Each workspace's own today in the nightly recommender**

In `services/work/recommend.py`, `refresh_all`: make `today` optional and compute it per workspace:

```python
def refresh_all(organisation=None, *, today=None, actor=None):
    """Every workspace with organisations (or just `organisation`), each on
    its own: one failing never stops the next. `today` None is each
    workspace's own date (`clock.today_for`)."""
```

and inside the loop:

```python
part = refresh(workspace, today=today or today_for(workspace), actor=actor)
```

with `from .clock import start_of_day, today_for` at the top of the module.

In `notify_waiting`, replace the "told already" filter (and its comment) with:

```python
        # "Today" is the workspace's own date (clock): from its local midnight.
        if Notification.objects.filter(
            recipient=recipient,
            kind=kind,
            created_at__gte=start_of_day(recipient.organisation, today),
        ).exists():
            continue
```

In `services/customers/management/commands/run_health_maintenance.py`, the recommender call becomes:

```python
                night = recommend.refresh_all(organisation)
```

- [ ] **Step 7: Run the new tests and the whole Work suite**

Run: `venv/bin/python manage.py test services.work --parallel auto --noinput`
Expected: all pass. `test_settings_api.WorkSettingsApiTests.test_any_member_reads_them_and_whether_they_may_change_them` still passes here (the payload changes in Task 2).

- [ ] **Step 8: Commit**

```bash
git add services/work/models.py services/work/migrations/0002_work_tracking_settings.py services/work/clock.py services/work/defaults.py services/work/recommendations.py services/work/deciding.py services/work/recommend.py services/customers/management/commands/run_health_maintenance.py services/work/tests/test_clock.py
git commit -m "feat(work): today and working days follow the workspace's timezone

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Settings › Work gains the tracking and digest fields

**Files:**
- Modify: `services/work/prefs.py` (payload, validation)
- Test: `services/work/tests/test_settings_api.py` (update the exact-payload test, add cases)

**Interfaces:**
- Consumes: Task 1's fields; `digest.email_ready()` does not exist yet, so this task adds `prefs.email_ready()` and Task 6 re-exports it from `digest`.
- Produces: `prefs.email_ready() -> bool`; `prefs.payload` keys per the contract.

- [ ] **Step 1: Write the failing tests**

In `services/work/tests/test_settings_api.py`, change the first test's expected dict to the contract's full shape:

```python
        self.assertEqual(
            self.ok(self.csm, URL),
            {
                "recommend_to": "manager",
                "sources": DEFAULT_SOURCES,
                "dismiss_cooldown_days": 14,
                "timezone": "UTC",
                "working_days": [0, 1, 2, 3, 4],
                "escalate_after_days": 2,
                "digest_enabled": True,
                "digest_hour": 8,
                "email_ready": True,
                "can_edit": False,
            },
        )
```

and add, at the end of the class:

```python
def test_admin_sets_the_tracking_and_digest_fields(self):
    body = {
        "timezone": "Asia/Kolkata",
        "working_days": [4, 0, 0, 6],
        "escalate_after_days": 5,
        "digest_enabled": False,
        "digest_hour": 0,
    }
    response = self.patch(self.admin, URL, body)
    self.assertEqual(response.status_code, 200, response.data)
    self.assertEqual(response.data["timezone"], "Asia/Kolkata")
    self.assertEqual(response.data["working_days"], [0, 4, 6])
    self.assertEqual((response.data["escalate_after_days"], response.data["digest_hour"]), (5, 0))
    self.assertFalse(response.data["digest_enabled"])
    event = AuditEvent.objects.filter(action="work.settings_update").latest("id")
    self.assertEqual(
        event.metadata["fields"],
        ["digest_enabled", "digest_hour", "escalate_after_days", "timezone", "working_days"],
    )


def test_utc_is_always_accepted(self):
    self.prefer(timezone="Asia/Kolkata")
    response = self.patch(self.admin, URL, {"timezone": "UTC"})
    self.assertEqual(response.status_code, 200, response.data)
    self.assertEqual(response.data["timezone"], "UTC")


def test_every_bad_tracking_value_is_refused_at_once(self):
    response = self.patch(
        self.admin,
        URL,
        {
            "timezone": "Mars/Olympus",
            "working_days": [],
            "escalate_after_days": 0,
            "digest_enabled": "yes",
            "digest_hour": 24,
        },
    )
    self.assertEqual(response.status_code, 400)
    self.assertEqual(
        response.data,
        {
            "timezone": ["Choose a timezone from the list."],
            "working_days": ["Choose at least one working day."],
            "escalate_after_days": ["Choose a whole number from 1 to 30."],
            "digest_enabled": ["Choose on or off."],
            "digest_hour": ["Choose a whole number from 0 to 23."],
        },
    )
    self.assertEqual(settings_for(self.org).timezone, "UTC")


def test_working_days_must_be_weekday_numbers(self):
    for bad in ([7], [0, "1"], [True], "0,1", [0.5]):
        with self.subTest(bad=bad):
            response = self.patch(self.admin, URL, {"working_days": bad})
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data, {"working_days": ["Choose at least one working day."]})


def test_the_same_values_are_not_a_change(self):
    self.patch(self.admin, URL, {"timezone": "UTC", "working_days": [4, 3, 2, 1, 0]})
    self.assertFalse(AuditEvent.objects.filter(action="work.settings_update").exists())


def test_a_member_cannot_change_the_tracking_fields(self):
    response = self.patch(self.csm, URL, {"digest_enabled": False})
    self.assertEqual(response.status_code, 403)
    self.assertTrue(settings_for(self.org).digest_enabled)


def test_email_ready_follows_the_mail_backend(self):
    from django.test import override_settings

    with override_settings(EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend"):
        self.assertFalse(self.ok(self.csm, URL)["email_ready"])
    with override_settings(EMAIL_BACKEND="django.core.mail.backends.dummy.EmailBackend"):
        self.assertFalse(self.ok(self.csm, URL)["email_ready"])
    with override_settings(EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend"):
        self.assertTrue(self.ok(self.csm, URL)["email_ready"])


def test_email_ready_and_can_edit_are_ignored_when_sent(self):
    response = self.patch(self.admin, URL, {"email_ready": False, "can_edit": False})
    self.assertEqual(response.status_code, 200)
    self.assertTrue(response.data["can_edit"])
```

(If `AuditEvent`'s action field is named differently, match the existing tests in this file: `grep -n "AuditEvent.objects" services/work/tests/test_settings_api.py`.)

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.work.tests.test_settings_api --parallel auto --noinput`
Expected: FAIL (payload lacks the new keys; PATCH ignores them).

- [ ] **Step 3: Implement**

In `services/work/prefs.py`, add the imports and constants:

```python
from functools import cache
from zoneinfo import available_timezones

from django.conf import settings as django_settings
```

```python
CHOOSE_TIMEZONE = "Choose a timezone from the list."
CHOOSE_WORKING_DAYS = "Choose at least one working day."
ESCALATE_LIMITS = (1, 30)
HOUR_LIMITS = (0, 23)
#: Mail backends that send nothing: the digest is skipped (spec §3.2).
NOT_SENDING = {
    "django.core.mail.backends.console.EmailBackend",
    "django.core.mail.backends.dummy.EmailBackend",
}


@cache
def timezones():
    return frozenset(available_timezones()) | {"UTC"}


def email_ready():
    """Whether this server can send email at all (spec §3.3 `email_ready`)."""
    return django_settings.EMAIL_BACKEND not in NOT_SENDING
```

`payload` becomes:

```python
def payload(prefs, reader):
    """`GET /work/settings/`: every field for every member."""
    return {
        "recommend_to": prefs.recommend_to,
        "sources": effective_sources(prefs),
        "dismiss_cooldown_days": prefs.dismiss_cooldown_days,
        "timezone": prefs.timezone,
        "working_days": list(working(prefs)),
        "escalate_after_days": prefs.escalate_after_days,
        "digest_enabled": prefs.digest_enabled,
        "digest_hour": prefs.digest_hour,
        "email_ready": email_ready(),
        "can_edit": reader.has_capability(Capability.MANAGE_ORG_SETTINGS),
    }
```

with `from .clock import working` (no cycle: `clock` imports `prefs` only inside `_prefs`).

Add the validators and call them from `changes_from`, before `if errors:`:

```python
def _working_days(value):
    if isinstance(value, list) and value and all(_is_whole(d) and 0 <= d <= 6 for d in value):
        return sorted(set(value))
    return None


def _tracking(prefs, data, changes, errors):
    """The delivery 3 fields of `data`, into `changes` and `errors`."""
    if "timezone" in data:
        value = data["timezone"]
        if isinstance(value, str) and value in timezones():
            if value != prefs.timezone:
                changes["timezone"] = value
        else:
            errors["timezone"] = [CHOOSE_TIMEZONE]
    if "working_days" in data:
        days = _working_days(data["working_days"])
        if days is None:
            errors["working_days"] = [CHOOSE_WORKING_DAYS]
        elif days != list(working(prefs)):
            changes["working_days"] = days
    for name, (low, high) in (
        ("escalate_after_days", ESCALATE_LIMITS),
        ("digest_hour", HOUR_LIMITS),
    ):
        if name in data:
            value = data[name]
            if _is_whole(value) and low <= value <= high:
                if value != getattr(prefs, name):
                    changes[name] = value
            else:
                errors[name] = [whole_number(low, high)]
    if "digest_enabled" in data:
        if isinstance(data["digest_enabled"], bool):
            if data["digest_enabled"] != prefs.digest_enabled:
                changes["digest_enabled"] = data["digest_enabled"]
        else:
            errors["digest_enabled"] = [ON_OR_OFF]
```

```python
    _tracking(prefs, data, changes, errors)
    if errors:
        raise ValidationError(errors)
    return changes
```

`WorkSettingsView.patch` already saves `update_fields=[*changes, ...]` and audits `sorted(changes)`: no view change.

- [ ] **Step 4: Run the tests**

Run: `venv/bin/python manage.py test services.work.tests.test_settings_api --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/work/prefs.py services/work/tests/test_settings_api.py
git commit -m "feat(work): Work settings carry timezone, working days, escalation and the digest

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Tasks remember nudges and escalations; changes re-arm them

**Files:**
- Modify: `services/customers/models.py` (Task fields)
- Create: `services/customers/migrations/0057_task_tracking.py` (generated)
- Modify: `services/notifications/models.py` (two kinds, docstring)
- Create: `services/notifications/migrations/0009_task_tracking_kinds.py` (generated)
- Modify: `services/customers/task_changes.py` (`record_changes`)
- Test: `services/work/tests/test_rearm.py` (new)

**Interfaces:**
- Produces: `Task.last_nudged_at`, `Task.escalated_at` (nullable DateTimeFields); `Notification.Kind.TASK_OVERDUE = "task_overdue"`, `Notification.Kind.TASK_ESCALATED = "task_escalated"`; `task_changes.rearms(task, before, names) -> bool`.

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_rearm.py`:

```python
"""Escalation happens once, until the task changes enough to deserve
another (spec §3.2, §5): reassigning, re-dating or re-opening it."""

from django.utils import timezone

from services.customers.models import Task, TaskEvent
from services.notifications.models import Notification
from services.work.tests.fixtures import WorkFixture


class RearmTests(WorkFixture):
    def setUp(self):
        Task.objects.filter(pk=self.overdue.pk).update(escalated_at=timezone.now())

    def url(self, task):
        return f"/api/v1/tasks/{task.pk}/"

    def patch(self, user, task, body):
        response = self.as_user(user).patch(self.url(task), body, format="json")
        self.assertEqual(response.status_code, 200, response.data)

    def escalated(self, task):
        return Task.objects.get(pk=task.pk).escalated_at

    def test_new_fields_default_to_null(self):
        self.assertIsNone(self.due_today.escalated_at)
        self.assertIsNone(self.due_today.last_nudged_at)

    def test_the_new_kinds_exist(self):
        self.assertEqual(Notification.Kind.TASK_OVERDUE, "task_overdue")
        self.assertEqual(Notification.Kind.TASK_ESCALATED, "task_escalated")

    def test_reassigning_rearms(self):
        self.patch(self.csm, self.overdue, {"assignee": self.mona.pk})
        self.assertIsNone(self.escalated(self.overdue))

    def test_changing_the_due_date_rearms(self):
        new = (self.today).isoformat()
        self.patch(self.csm, self.overdue, {"due_date": new})
        self.assertIsNone(self.escalated(self.overdue))

    def test_reopening_a_completed_task_rearms(self):
        Task.objects.filter(pk=self.done.pk).update(escalated_at=timezone.now())
        self.patch(self.csm, self.done, {"status": "pending"})
        self.assertIsNone(self.escalated(self.done))

    def test_other_edits_keep_it_escalated(self):
        self.patch(self.csm, self.overdue, {"title": "Call Pizza Hut today", "priority": "low"})
        self.patch(self.csm, self.overdue, {"status": "in-progress"})
        self.assertIsNotNone(self.escalated(self.overdue))

    def test_rearming_writes_no_event_of_its_own(self):
        before = TaskEvent.objects.filter(task=self.overdue).count()
        self.patch(self.csm, self.overdue, {"assignee": self.mona.pk})
        kinds = list(
            TaskEvent.objects.filter(task=self.overdue).values_list("kind", flat=True)[before:]
        )
        self.assertEqual(kinds, ["assigned"])
```

(The PATCH field for the assignee is `assignee`, an id, as delivery 1's `TaskPatchSerializer` defines; check `grep -n "assignee" services/customers/task_views.py` if a test 400s.)

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.work.tests.test_rearm --parallel auto --noinput`
Expected: errors (`escalated_at` is not a field).

- [ ] **Step 3: Add the fields and the kinds**

In `Task` (`services/customers/models.py`), after `source`:

```python
    # Work's tracking (services/work/tracking.py): when the assignee was last
    # reminded it is overdue, and when it was escalated (once; a reassign, a
    # new due date or re-opening clears it: task_changes.record_changes).
    last_nudged_at = models.DateTimeField(null=True, blank=True)
    escalated_at = models.DateTimeField(null=True, blank=True)
```

and add to the class docstring's last sentence: "`last_nudged_at` and `escalated_at` are Work's tracking (services/work/tracking.py)."

In `Notification.Kind` (`services/notifications/models.py`), after `RECOMMENDATIONS_WAITING`:

```python
        TASK_OVERDUE = "task_overdue", "Task overdue"
        TASK_ESCALATED = "task_escalated", "Task escalated"
```

and extend the docstring's list: "an overdue task's reminder to its assignee (`task_overdue`) and its one escalation to their manager (`task_escalated`), services/work/tracking.py".

Run:
`venv/bin/python manage.py makemigrations customers --name task_tracking`
`venv/bin/python manage.py makemigrations notifications --name task_tracking_kinds`
Expected: `0057_task_tracking.py` (two AddFields) and `0009_task_tracking_kinds.py` (AlterField on `kind`).

- [ ] **Step 4: Re-arm in `record_changes`**

In `services/customers/task_changes.py`, add:

```python
#: A change to any of these makes an escalated task eligible again (spec §3.2).
REARMING = frozenset({"assignee", "due_date"})


def rearms(task, before, names):
    """Whether this change re-arms the task's one escalation."""
    reopened = before["status"] == Task.Status.COMPLETED and task.status != Task.Status.COMPLETED
    return reopened or bool(REARMING & set(names))
```

`snapshot` needs no change (`escalated_at` is read from the task itself). At the end of `record_changes`, before `return names`:

```python
    if task.escalated_at is not None and rearms(task, before, names):
        Task.objects.filter(pk=task.pk).update(escalated_at=None)
        task.escalated_at = None
```

Update the module docstring's second paragraph to say `record_changes` also re-arms escalation.

- [ ] **Step 5: Run the tests and the task suites**

Run: `venv/bin/python manage.py test services.work services.customers services.plans --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/customers/models.py services/customers/migrations/0057_task_tracking.py services/notifications/models.py services/notifications/migrations/0009_task_tracking_kinds.py services/customers/task_changes.py services/work/tests/test_rearm.py
git commit -m "feat(work): tasks remember nudges and escalations; reassign, re-date or re-open re-arms

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The tracking pass (nudge, escalate)

**Files:**
- Create: `services/work/tracking.py`
- Modify: `services/customers/management/commands/run_health_maintenance.py` (a step after the recommender)
- Test: `services/work/tests/test_tracking.py` (new)

**Interfaces:**
- Consumes: Task 1's `clock` functions and settings fields; Task 3's fields and kinds; `task_changes.link`, `task_changes.person`, `task_access.record_of`, `scoping.can_open`, `identity.ownership.owner_membership`, `states.open_tasks`, `states.overdue_q`.
- Produces:
  - `tracking.TrackResult(nudged: int = 0, escalated: int = 0, quiet: bool = False, failed: list[str])`
  - `tracking.run(organisation, *, now=None) -> TrackResult`
  - `tracking.run_all(organisation=None, *, now=None) -> TrackResult`
  - `tracking.overdue_message(recipient, task, days) -> str`, `tracking.escalated_message(recipient, task, late) -> str`

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_tracking.py`:

```python
"""Nudges and escalations (spec §3.2, §4, §5). WorkFixture's open overdue
work: Carl's "Call Pizza Hut" (2 days), his "West handover" (1 day, on Taco
West, which Carl cannot open), and Dana's "Taco Bell review" (3 days).
"Send the contract" is Blocked and "Old call" completed: never tracked.
Carl reports to Mona; Dana has no manager; Alice owns the workspace."""

from datetime import UTC, date, datetime, time, timedelta

from django.utils import timezone

from services.accounts.models import Organisation, User
from services.customers.models import Task, TaskEvent
from services.identity.models import OrganizationMembership
from services.notifications.models import Notification
from services.work import tracking
from services.work.models import WorkSettings
from services.work.prefs import settings_for
from services.work.tests.fixtures import WorkFixture

EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
K = Notification.Kind


class TrackingTests(WorkFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        OrganizationMembership.objects.update_or_create(
            organisation=cls.org, user=cls.admin, defaults={"is_owner": True, "status": "active"}
        )

    def setUp(self):
        # Every day a working day unless a test says otherwise, so the
        # fixture's dates (relative to the real today) behave the same any day.
        self.prefer(working_days=EVERY_DAY, escalate_after_days=2)
        self.now = datetime.combine(self.today, time(10, 0), tzinfo=UTC)

    def prefer(self, **fields):
        WorkSettings.objects.filter(pk=settings_for(self.org).pk).update(**fields)

    def run_pass(self, now=None):
        return tracking.run(Organisation.objects.get(pk=self.org.pk), now=now or self.now)

    def told(self, kind, recipient):
        return list(
            Notification.objects.filter(kind=kind, recipient=recipient).values_list(
                "message", flat=True
            )
        )

    # Nudges

    def test_each_overdue_task_nudges_its_assignee_once(self):
        result = self.run_pass()
        self.assertEqual(result.nudged, 3)
        self.assertCountEqual(
            self.told(K.TASK_OVERDUE, self.csm),
            [
                "“Call Pizza Hut” on Pizza Hut is 2 days overdue.",
                "A task on an account you can't open is overdue.",
            ],
        )
        self.assertEqual(
            self.told(K.TASK_OVERDUE, self.other),
            ["“Taco Bell review” on Taco Bell is 3 days overdue."],
        )
        note = Notification.objects.filter(kind=K.TASK_OVERDUE, recipient=self.other).get()
        self.assertEqual(note.link, f"/work/today?task={self.danas.pk}")
        self.assertIsNone(note.actor)

    def test_a_nudge_writes_a_nudged_event(self):
        self.run_pass()
        event = TaskEvent.objects.get(task=self.overdue, kind=TaskEvent.Kind.NUDGED)
        self.assertIsNone(event.actor)
        self.assertEqual(
            event.data, {"days_overdue": 2, "to": {"id": self.csm.pk, "name": "Carl CSM"}}
        )

    def test_one_day_is_singular(self):
        Task.objects.filter(pk=self.overdue.pk).update(due_date=self.today - timedelta(days=1))
        self.run_pass()
        self.assertIn(
            "“Call Pizza Hut” on Pizza Hut is 1 day overdue.", self.told(K.TASK_OVERDUE, self.csm)
        )

    def test_once_per_local_day(self):
        # Tomorrow "Prep the Dough Co QBR" is overdue too: keep it out.
        Task.objects.filter(pk=self.due_today.pk).update(status="completed")
        self.run_pass()
        same_day = self.run_pass(self.now + timedelta(hours=13))
        self.assertEqual(same_day.nudged, 0)
        next_day = self.run_pass(self.now + timedelta(days=1))
        self.assertEqual(next_day.nudged, 3)

    def test_a_run_the_next_day_under_24_hours_later_still_nudges(self):
        Task.objects.filter(pk=self.due_today.pk).update(status="completed")
        self.run_pass()
        next_morning = self.run_pass(self.now + timedelta(hours=23))
        self.assertEqual(next_morning.nudged, 3)

    def test_blocked_completed_and_not_yet_due_are_never_nudged(self):
        self.run_pass()
        nudged = set(
            TaskEvent.objects.filter(kind=TaskEvent.Kind.NUDGED).values_list("task_id", flat=True)
        )
        self.assertEqual(nudged, {self.overdue.pk, self.handed.pk, self.danas.pk})

    def test_a_task_with_no_assignee_is_left_alone(self):
        Task.objects.filter(pk=self.danas.pk).update(assignee=None)
        result = self.run_pass()
        self.assertEqual(result.nudged, 2)
        self.assertIsNone(Task.objects.get(pk=self.danas.pk).escalated_at)

    def test_a_deactivated_assignee_is_not_nudged(self):
        User.objects.filter(pk=self.other.pk).update(is_active=False)
        self.run_pass()
        self.assertEqual(self.told(K.TASK_OVERDUE, self.other), [])

    # Escalations

    def test_escalates_once_overdue_by_enough_working_days(self):
        self.run_pass()
        # Carl's 2-day task reaches 2; his 1-day handover does not; Dana's 3-day one does.
        self.assertEqual(
            self.told(K.TASK_ESCALATED, self.mona),
            ["“Call Pizza Hut” on Pizza Hut, assigned to Carl CSM, is 2 working days overdue."],
        )
        self.assertEqual(
            self.told(K.TASK_ESCALATED, self.admin),
            ["“Taco Bell review” on Taco Bell, assigned to Dana CSM, is 3 working days overdue."],
        )
        self.assertIsNone(Task.objects.get(pk=self.handed.pk).escalated_at)

    def test_an_escalation_writes_an_escalated_event(self):
        self.run_pass()
        event = TaskEvent.objects.get(task=self.overdue, kind=TaskEvent.Kind.ESCALATED)
        self.assertEqual(
            event.data,
            {"working_days_overdue": 2, "to": {"id": self.mona.pk, "name": "Mona Manager"}},
        )

    def test_escalates_only_once(self):
        # The handover would reach 2 working days tomorrow: keep it out.
        Task.objects.filter(pk=self.handed.pk).update(status="completed")
        first = self.run_pass()
        second = self.run_pass(self.now + timedelta(days=1))
        self.assertEqual((first.escalated, second.escalated), (2, 0))
        self.assertEqual(len(self.told(K.TASK_ESCALATED, self.mona)), 1)

    def test_a_reassigned_task_escalates_again(self):
        Task.objects.filter(pk=self.handed.pk).update(status="completed")
        self.run_pass()
        response = self.as_user(self.mona).patch(
            f"/api/v1/tasks/{self.overdue.pk}/", {"assignee": self.csm.pk}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        # The assignee did not change, so it stays escalated.
        self.assertIsNotNone(Task.objects.get(pk=self.overdue.pk).escalated_at)
        response = self.as_user(self.mona).patch(
            f"/api/v1/tasks/{self.overdue.pk}/",
            {"due_date": (self.today - timedelta(days=3)).isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.run_pass(self.now + timedelta(days=1))
        self.assertEqual(len(self.told(K.TASK_ESCALATED, self.mona)), 2)

    def test_the_manager_is_told_generically_about_a_record_they_cannot_open(self):
        Task.objects.filter(pk=self.handed.pk).update(due_date=self.today - timedelta(days=4))
        self.run_pass()
        self.assertIn(
            "A task assigned to Carl CSM on an account you can't open is overdue.",
            self.told(K.TASK_ESCALATED, self.mona),
        )

    def test_an_inactive_manager_falls_back_to_the_owner(self):
        User.objects.filter(pk=self.mona.pk).update(is_active=False)
        self.run_pass()
        self.assertIn(
            "“Call Pizza Hut” on Pizza Hut, assigned to Carl CSM, is 2 working days overdue.",
            self.told(K.TASK_ESCALATED, self.admin),
        )

    def test_a_deactivated_assignee_escalates_straight_away(self):
        self.prefer(escalate_after_days=30)
        User.objects.filter(pk=self.csm.pk).update(is_active=False)
        self.run_pass()
        escalated = set(
            Task.objects.filter(escalated_at__isnull=False).values_list("id", flat=True)
        )
        self.assertEqual(escalated, {self.overdue.pk, self.handed.pk})

    def test_nobody_above_marks_it_escalated_without_telling_anyone(self):
        OrganizationMembership.objects.filter(organisation=self.org).update(is_owner=False)
        OrganizationMembership.objects.update_or_create(
            organisation=self.org, user=self.other, defaults={"is_owner": True, "status": "active"}
        )
        self.run_pass()
        self.assertIsNotNone(Task.objects.get(pk=self.danas.pk).escalated_at)
        self.assertEqual(self.told(K.TASK_ESCALATED, self.other), [])
        self.assertFalse(
            TaskEvent.objects.filter(task=self.danas, kind=TaskEvent.Kind.ESCALATED).exists()
        )

    # Working days and timezones

    def test_nothing_happens_on_a_non_working_day(self):
        self.prefer(working_days=[d for d in EVERY_DAY if d != self.today.weekday()])
        result = self.run_pass()
        self.assertTrue(result.quiet)
        self.assertFalse(
            Notification.objects.filter(kind__in=[K.TASK_OVERDUE, K.TASK_ESCALATED]).exists()
        )

    def test_weekends_do_not_count_toward_escalation(self):
        # Due Friday 9 Oct 2026; Monday the 12th is 1 working day overdue, Tuesday 2.
        self.prefer(working_days=[0, 1, 2, 3, 4])
        friday = date(2026, 10, 9)
        Task.objects.exclude(pk=self.overdue.pk).update(status="completed")
        Task.objects.filter(pk=self.overdue.pk).update(due_date=friday)
        monday = datetime(2026, 10, 12, 10, 0, tzinfo=UTC)
        self.assertEqual(self.run_pass(monday).escalated, 0)
        self.assertEqual(self.run_pass(monday + timedelta(days=1)).escalated, 1)

    def test_the_workspace_date_decides_what_is_overdue(self):
        # 20:00 UTC on the due date is already the next day in Kolkata.
        self.prefer(timezone="Asia/Kolkata")
        Task.objects.exclude(pk=self.due_today.pk).update(status="completed")
        late = datetime.combine(self.today, time(20, 0), tzinfo=UTC)
        self.assertEqual(self.run_pass(late).nudged, 1)
        self.prefer(timezone="UTC")
        Task.objects.filter(pk=self.due_today.pk).update(last_nudged_at=None)
        self.assertEqual(self.run_pass(late).nudged, 0)

    # The nightly entry point

    def test_run_all_keeps_going_when_one_workspace_fails(self):
        from unittest.mock import patch

        real = tracking.run

        def flaky(organisation, *, now=None):
            if organisation.pk == self.org.pk:
                raise RuntimeError("Pizza Hut")
            return real(organisation, now=now)

        with patch.object(tracking, "run", side_effect=flaky):
            result = tracking.run_all(now=self.now)
        self.assertEqual(result.failed, [f"organisation {self.org.pk}"])
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.work.tests.test_tracking --parallel auto --noinput`
Expected: `ImportError` / `AttributeError` (`tracking` does not exist).

- [ ] **Step 3: Implement `services/work/tracking.py`**

```python
"""Tracking that pushes (Work round §3.2): once a day, on the workspace's
working days, each open overdue task (past due, not Blocked, with an
assignee) reminds its assignee at most once a day, in the workspace's own date
(`task_overdue`, a
`nudged` event) and, once it is `escalate_after_days` working days overdue,
tells their manager once (`task_escalated`, an `escalated` event). A
deactivated assignee is not reminded and escalates straight away.

Once only, under overlap: each nudge and escalation first claims the task
with a conditional UPDATE, and only a claim that changed a row notifies.
Reassigning, re-dating or re-opening re-arms the escalation
(customers.task_changes.record_changes).

A notice names the record only to a recipient who may open it (spec §4)."""

import logging
from dataclasses import dataclass, field
from datetime import datetime, time

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from services.customers.models import Account, Customer, Task, TaskEvent
from services.customers.scoping import can_open
from services.customers.task_access import record_of
from services.customers.task_changes import link, person

from .clock import local_now, working, working_days_between, zone
from .prefs import settings_for
from .states import open_tasks, overdue_q

logger = logging.getLogger(__name__)


@dataclass
class TrackResult:
    nudged: int = 0
    escalated: int = 0
    #: True when today is not one of the workspace's working days.
    quiet: bool = False
    failed: list = field(default_factory=list)

    def add(self, other):
        self.nudged += other.nudged
        self.escalated += other.escalated


def plural(count, word):
    return f"{count} {word}" + ("" if count == 1 else "s")


def _noun(record):
    return "an organisation" if isinstance(record, Customer) else "an account"


def overdue_message(recipient, task, days):
    record = record_of(task)
    # SOC2:AUTH-02 a record is named only to someone who may open it
    if can_open(recipient, record):
        return f"“{task.title}” on {record.name} is {plural(days, 'day')} overdue."[:500]
    return f"A task on {_noun(record)} you can't open is overdue."


def escalated_message(recipient, task, late):
    record = record_of(task)
    name = task.assignee.name
    # SOC2:AUTH-02 a record is named only to someone who may open it
    if can_open(recipient, record):
        return (
            f"“{task.title}” on {record.name}, assigned to {name}, "
            f"is {plural(late, 'working day')} overdue."
        )[:500]
    return f"A task assigned to {name} on {_noun(record)} you can't open is overdue."[:500]


def workspace_tasks(organisation):
    """Every task on the workspace's organisations and accounts (id IN, no join)."""
    return Task.objects.filter(
        Q(customer_id__in=Customer.objects.filter(organisation=organisation).values("id"))
        | Q(account_id__in=Account.objects.filter(organisation=organisation).values("id"))
    )


def _owner(organisation):
    from services.identity.ownership import owner_membership

    membership = owner_membership(organisation)
    if membership is None or not membership.user.is_active:
        return None
    return membership.user


def _above(task, owner):
    """Who an escalation goes to: the assignee's active manager in the same
    workspace, else the workspace's owner; None when that is nobody or the
    assignee themself."""
    manager = task.assignee.reports_to
    if (
        manager is not None
        and manager.is_active
        and manager.organisation_id == task.assignee.organisation_id
    ):
        return manager
    if owner is not None and owner.pk != task.assignee_id:
        return owner
    return None


def _notify(**kwargs):
    from services.notifications.realtime import notify

    return notify(actor=None, push_on_commit=True, **kwargs)


def _nudge(task, today, now, day_start):
    from services.notifications.models import Notification

    with transaction.atomic():
        claimed = (
            Task.objects.filter(pk=task.pk)
            .filter(Q(last_nudged_at__isnull=True) | Q(last_nudged_at__lt=day_start))
            .update(last_nudged_at=now)
        )
        if not claimed:
            return False
        days = (today - task.due_date).days
        _notify(
            recipient=task.assignee,
            kind=Notification.Kind.TASK_OVERDUE,
            message=overdue_message(task.assignee, task, days),
            link=link(task),
        )
        TaskEvent.objects.create(
            task=task,
            actor=None,
            kind=TaskEvent.Kind.NUDGED,
            data={"days_overdue": days, "to": person(task.assignee)},
        )
    return True


def _escalate(task, late, now, owner):
    from services.notifications.models import Notification

    with transaction.atomic():
        claimed = Task.objects.filter(pk=task.pk, escalated_at__isnull=True).update(
            escalated_at=now
        )
        if not claimed:
            return False
        above = _above(task, owner)
        if above is None:
            return False
        _notify(
            recipient=above,
            kind=Notification.Kind.TASK_ESCALATED,
            message=escalated_message(above, task, late),
            link=link(task),
        )
        TaskEvent.objects.create(
            task=task,
            actor=None,
            kind=TaskEvent.Kind.ESCALATED,
            data={"working_days_overdue": late, "to": person(above)},
        )
    return True


def run(organisation, *, now=None):
    """One pass over `organisation`. See the module."""
    now = now or timezone.now()
    prefs = settings_for(organisation)
    today = local_now(organisation, now).date()
    days = working(prefs)
    result = TrackResult()
    if today.weekday() not in days:
        result.quiet = True
        return result
    owner = _owner(organisation)
    day_start = datetime.combine(today, time.min, tzinfo=zone(prefs))
    overdue = (
        open_tasks(workspace_tasks(organisation))
        .filter(overdue_q(today), assignee__isnull=False)
        .select_related("assignee", "assignee__reports_to", "customer", "account")
        .order_by("due_date", "id")
    )
    for task in overdue:
        active = task.assignee.is_active
        if active and _nudge(task, today, now, day_start):
            result.nudged += 1
        if task.escalated_at is not None:
            continue
        late = working_days_between(task.due_date, today, days)
        if (not active or late >= prefs.escalate_after_days) and _escalate(task, late, now, owner):
            result.escalated += 1
    return result


def run_all(organisation=None, *, now=None):
    """Every workspace with organisations (or just `organisation`), each on
    its own: one failing never stops the next."""
    from services.accounts.models import Organisation

    if organisation is not None:
        workspaces = [organisation]
    else:
        workspaces = Organisation.objects.filter(
            id__in=Customer.objects.values("organisation_id")
        ).order_by("id")
    total = TrackResult()
    for workspace in workspaces:
        try:
            total.add(run(workspace, now=now))
        except Exception as exc:  # noqa: BLE001 - reported, never fatal
            logger.warning(
                "work tracking: organisation %s failed: %s", workspace.pk, type(exc).__name__
            )
            total.failed.append(f"organisation {workspace.pk}")
    return total
```

Note on `test_run_all_keeps_going_when_one_workspace_fails`: `run_all` must call `run` through the module (`run(...)` inside the module resolves the global at call time, so `patch.object(tracking, "run", ...)` takes effect).

- [ ] **Step 4: Run the tests**

Run: `venv/bin/python manage.py test services.work.tests.test_tracking --parallel auto --noinput`
Expected: PASS. If `test_the_workspace_date_decides_what_is_overdue`'s second half is flaky around midnight UTC, it is because `self.today` (real date) was read before midnight: the test's `now` is built from `self.today`, so it is stable.

- [ ] **Step 5: Call it nightly**

In `run_health_maintenance.py`, right after the "Recommended work" block's `except`, add:

```python
# Tracking that pushes: overdue tasks remind their assignees and
# escalate once to a manager, on each workspace's working days
# (services.work.tracking). Never fatal.
if not options["dry_run"]:
    from services.work import tracking

    try:
        night = tracking.run_all(organisation)
        self.stdout.write(
            self.style.SUCCESS(
                f"nudged {night.nudged} overdue task(s); escalated {night.escalated}"
            )
        )
        for failure in night.failed:
            self.stdout.write(self.style.WARNING(f"task tracking failed: {failure}"))
    except Exception as exc:  # noqa: BLE001 - reported, never fatal
        # the class name only: an exception's text can quote a row's values
        self.stdout.write(self.style.WARNING(f"task tracking skipped: {type(exc).__name__}"))
```

Add to `services/work/tests/test_tracking.py`:

```python
class NightlyCommandTests(WorkFixture):
    def test_run_health_maintenance_nudges(self):
        from io import StringIO

        from django.core.management import call_command

        WorkSettings.objects.filter(pk=settings_for(self.org).pk).update(working_days=EVERY_DAY)
        out = StringIO()
        call_command("run_health_maintenance", stdout=out)
        self.assertIn("nudged 3 overdue task(s)", out.getvalue())
```

Run: `venv/bin/python manage.py test services.work.tests.test_tracking services.customers.tests --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/work/tracking.py services/work/tests/test_tracking.py services/customers/management/commands/run_health_maintenance.py
git commit -m "feat(work): nudge overdue tasks daily and escalate them once to a manager

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: A personal digest switch (`digest_opt_out`)

**Files:**
- Modify: `services/accounts/models.py` (User field)
- Create: `services/accounts/migrations/0014_user_digest_opt_out.py` (generated)
- Modify: `services/accounts/serializers.py` (`MeSerializer.Meta.fields`)
- Test: `services/accounts/tests/test_digest_opt_out.py` (new)

**Interfaces:**
- Produces: `User.digest_opt_out: bool` (default False), readable and writable on `GET/PATCH /api/v1/auth/me/`.

- [ ] **Step 1: Write the failing test**

```python
"""A person's own switch for Work's daily digest (spec §3.1): on their own
profile only, in the API now, in account settings later."""

from rest_framework.test import APITestCase

from services.accounts.models import Organisation, User

ME = "/api/v1/auth/me/"


class DigestOptOutTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organisation.objects.create(name="Acme Inc", currency="USD")
        cls.user = User.objects.create_user(
            email="carl@acme.io", password="pw-123456789", name="Carl CSM", organisation=cls.org
        )

    def setUp(self):
        self.client.force_authenticate(self.user)

    def test_it_defaults_to_off_and_is_on_my_profile(self):
        response = self.client.get(ME)
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.data["digest_opt_out"], False)

    def test_i_can_turn_it_on(self):
        response = self.client.patch(ME, {"digest_opt_out": True}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(User.objects.get(pk=self.user.pk).digest_opt_out)
```

(If `create_user` needs other arguments here, copy how `services/accounts/tests/` builds a user: `grep -rn "create_user(" services/accounts/tests | head -3`.)

- [ ] **Step 2: Run it to see it fail**

Run: `venv/bin/python manage.py test services.accounts.tests.test_digest_opt_out --parallel auto --noinput`
Expected: FAIL (`KeyError: 'digest_opt_out'`).

- [ ] **Step 3: Implement**

In `User` (`services/accounts/models.py`), near `tour_completed_at`:

```python
    # Work's daily digest email (services/work/digest.py): true means none
    # for this person, whatever their workspace says. Set on their own
    # profile (`PATCH /auth/me/`).
    digest_opt_out = models.BooleanField(default=False)
```

Run: `venv/bin/python manage.py makemigrations accounts --name user_digest_opt_out`

In `MeSerializer.Meta.fields`, add `"digest_opt_out"` after `"mfa_enrolled"` (not in `read_only_fields`, so it is writable; `MeView` is the caller's own profile only).

- [ ] **Step 4: Run it**

Run: `venv/bin/python manage.py test services.accounts --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/accounts/models.py services/accounts/migrations/0014_user_digest_opt_out.py services/accounts/serializers.py services/accounts/tests/test_digest_opt_out.py
git commit -m "feat(accounts): a personal switch to opt out of Work's daily digest

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The daily digest

**Files:**
- Modify: `services/work/models.py` (`DigestSend`)
- Create: `services/work/migrations/0003_digestsend.py` (generated)
- Create: `services/work/digest.py`
- Modify: `services/email.py` (`send_work_digest`)
- Modify: `services/campaigns/management/commands/deliver_pending.py`
- Test: `services/work/tests/test_digest.py` (new)

**Interfaces:**
- Consumes: `today.build(reader, *, today)` (its `counts` and `groups`, rows from `task_row`: `title`, `due_date`, `parent.name`), `rec_access.decidable`, `rec_access.openable`, `rec_access.default_scope`, `prefs.email_ready`, `prefs.settings_for`, `clock.zone`, `clock.working`.
- Produces:
  - `DigestSend(user, local_date, status, created_at)`; `DigestSend.Status`: `pending` (default), `sent`, `empty`, `failed`
  - `digest.DigestResult(sent=0, empty=0, failed=0, skipped=False)`
  - `digest.contents(reader, *, today) -> tuple[str, str] | None` (subject, body)
  - `digest.send_due(now=None) -> DigestResult`
  - `email.send_work_digest(user, subject, body)`

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_digest.py`:

```python
"""The daily digest (spec §3.2 Digest, §4): once per person per local day,
after the workspace's digest hour on its working days, through the reader's
own visibility, skipped without SMTP, honouring opt-out."""

from datetime import UTC, datetime, time, timedelta
from unittest.mock import patch

from django.core import mail
from django.test import override_settings

from services.accounts.models import User
from services.work import digest
from services.work.models import DigestSend, WorkSettings
from services.work.prefs import settings_for
from services.work.tests.fixtures import WorkFixture

EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
CONSOLE = "django.core.mail.backends.console.EmailBackend"


class DigestTests(WorkFixture):
    def setUp(self):
        self.prefer(working_days=EVERY_DAY, digest_hour=8)
        self.at_nine = datetime.combine(self.today, time(9, 0), tzinfo=UTC)

    def prefer(self, **fields):
        WorkSettings.objects.filter(pk=settings_for(self.org).pk).update(**fields)

    def sent_to(self):
        return sorted(address for message in mail.outbox for address in message.to)

    def message_for(self, email):
        return next(m for m in mail.outbox if m.to == [email])

    def test_carl_gets_his_own_work(self):
        digest.send_due(self.at_nine)
        message = self.message_for("carl@acme.io")
        day = f"{self.today:%a} {self.today.day} {self.today:%b}"
        self.assertEqual(message.subject, f"Your work for {day}: 1 overdue, 1 due today")
        self.assertIn("1 overdue\n1 due today\n1 blocked", message.body)
        self.assertIn("- Call Pizza Hut (Pizza Hut), due ", message.body)
        self.assertIn("- Prep the Dough Co QBR (Dough Co)", message.body)
        self.assertIn("/work/today", message.body)

    def test_it_never_names_what_the_reader_cannot_open(self):
        digest.send_due(self.at_nine)
        body = self.message_for("carl@acme.io").body
        self.assertNotIn("West handover", body)
        self.assertNotIn("Taco West", body)

    def test_nobody_with_nothing_to_report_gets_one(self):
        digest.send_due(self.at_nine)
        self.assertNotIn("gus@globex.io", self.sent_to())
        self.assertEqual(DigestSend.objects.get(user=self.lee).status, DigestSend.Status.EMPTY)

    def test_only_after_the_local_hour(self):
        result = digest.send_due(self.at_nine - timedelta(hours=2))
        self.assertEqual((result.sent, len(mail.outbox)), (0, 0))

    def test_the_hour_is_local(self):
        # 03:30 UTC is 09:00 in Kolkata.
        self.prefer(timezone="Asia/Kolkata")
        early = datetime.combine(self.today, time(3, 30), tzinfo=UTC)
        digest.send_due(early)
        self.assertIn("carl@acme.io", self.sent_to())

    def test_once_per_local_day(self):
        digest.send_due(self.at_nine)
        count = len(mail.outbox)
        again = digest.send_due(self.at_nine + timedelta(minutes=1))
        self.assertEqual((again.sent, len(mail.outbox)), (0, count))

    def test_not_on_a_non_working_day(self):
        self.prefer(working_days=[d for d in EVERY_DAY if d != self.today.weekday()])
        digest.send_due(self.at_nine)
        self.assertEqual(mail.outbox, [])

    def test_not_when_the_workspace_turned_it_off(self):
        self.prefer(digest_enabled=False)
        digest.send_due(self.at_nine)
        self.assertEqual(mail.outbox, [])

    def test_not_to_someone_who_opted_out_or_left(self):
        User.objects.filter(pk=self.csm.pk).update(digest_opt_out=True)
        User.objects.filter(pk=self.other.pk).update(is_active=False)
        digest.send_due(self.at_nine)
        self.assertNotIn("carl@acme.io", self.sent_to())
        self.assertNotIn("dana@acme.io", self.sent_to())

    def test_a_manager_hears_about_recommendations_waiting(self):
        from services.work.models import Recommendation

        Recommendation.objects.create(
            organisation=self.org,
            customer=self.pizza,
            kind="renewal_due",
            title="Prepare Pizza Hut's renewal",
            recipient=self.mona,
            suggested_assignee=self.csm,
        )
        digest.send_due(self.at_nine)
        message = self.message_for("mona@acme.io")
        self.assertIn("1 recommendation waiting", message.body)

    @override_settings(EMAIL_BACKEND=CONSOLE)
    def test_skipped_without_smtp_and_nothing_claimed(self):
        result = digest.send_due(self.at_nine)
        self.assertTrue(result.skipped)
        self.assertFalse(DigestSend.objects.exists())

    def test_a_failed_send_is_marked_and_the_rest_carry_on(self):
        real = digest.send_work_digest

        def flaky(user, subject, body):
            if user.email == "carl@acme.io":
                raise OSError("smtp down")
            return real(user, subject, body)

        with patch.object(digest, "send_work_digest", side_effect=flaky):
            result = digest.send_due(self.at_nine)
        self.assertEqual(DigestSend.objects.get(user=self.csm).status, DigestSend.Status.FAILED)
        self.assertGreaterEqual(result.sent, 1)
        self.assertEqual(result.failed, 1)

    def test_deliver_pending_sends_digests(self):
        from io import StringIO

        from django.core.management import call_command

        with patch("django.utils.timezone.now", return_value=self.at_nine):
            call_command("deliver_pending", stdout=StringIO())
        self.assertIn("carl@acme.io", self.sent_to())
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.work.tests.test_digest --parallel auto --noinput`
Expected: `ImportError` (`DigestSend`, `digest`).

- [ ] **Step 3: The model**

In `services/work/models.py`, at the end:

```python
class DigestSend(models.Model):
    """One person's daily digest for one local date (spec §3.2 Digest):
    claimed (inserted, `pending`) before it is built or sent, so nobody gets
    two even when two runners overlap; `sent` is set after the send, so a
    crash in between leaves `pending`. `empty`: nothing to report; `failed`: the send
    raised (not retried that day)."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SENT = "sent", "Sent"
        EMPTY = "empty", "Nothing to report"
        FAILED = "failed", "Failed"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="+", on_delete=models.CASCADE)
    local_date = models.DateField()
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "local_date"], name="digest_once_per_day")
        ]

    def __str__(self):
        return f"Digest {self.local_date} -> {self.user_id} ({self.status})"
```

Run: `venv/bin/python manage.py makemigrations work --name digestsend`

- [ ] **Step 4: The email**

In `services/email.py`, after `send_campaign_email`:

```python
def send_work_digest(user, subject, body):
    """Work's daily digest to one person, plain text (services.work.digest).
    Raises on failure; the digest marks that person's day failed."""

    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
    )
```

- [ ] **Step 5: `services/work/digest.py`**

```python
"""Work's daily digest (spec §3.2 Digest, §4). Called every minute by the
`sender` service (`deliver_pending`). For each workspace with the digest on,
once its local time reaches `digest_hour` on one of its working days, each
active member with an email who has not opted out gets one plain-text email
for that local date, built through the same functions as `/work/today` and
`/work/recommendations/` so it never names what they cannot open.

A `DigestSend` row is claimed before each send (at most once per person per
day). Without a mail server (`prefs.email_ready`) nothing is claimed or
sent, and that is logged once per process."""

import logging
from dataclasses import dataclass
from datetime import date

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from services.email import send_work_digest

from . import today as today_list
from .clock import working, zone
from .models import DigestSend
from .prefs import email_ready, settings_for
from .rec_access import decidable, default_scope, openable
from .tracking import plural

logger = logging.getLogger(__name__)

NAMED = 5
_told_unready = False


@dataclass
class DigestResult:
    sent: int = 0
    empty: int = 0
    failed: int = 0
    skipped: bool = False


def _short(day):
    return f"{day:%a} {day.day} {day:%b}"


def contents(reader, *, today):
    """(subject, body) for `reader` on `today`, or None with nothing to report."""
    mine = today_list.build(reader, today=today)
    counts = mine["counts"]
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
    named = [("Overdue", row) for row in mine["groups"]["overdue"]]
    named += [("Due today", row) for row in mine["groups"]["today"]]
    items, heading = [], None
    for group, row in named[:NAMED]:
        if group != heading:
            items.append(group)
            heading = group
        when = (
            "" if group == "Due today" else f", due {_short(date.fromisoformat(row['due_date']))}"
        )
        items.append(f"- {row['title']} ({row['parent']['name']}){when}")
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


def _members_due(organisation, day):
    from services.accounts.models import User

    return (
        User.objects.filter(organisation=organisation, is_active=True, digest_opt_out=False)
        .exclude(email="")
        .exclude(id__in=DigestSend.objects.filter(local_date=day).values("user_id"))
        .order_by("id")
    )


def _claim(user, day):
    try:
        with transaction.atomic():
            return DigestSend.objects.create(user=user, local_date=day)
    except IntegrityError:
        return None


def _send_workspace(organisation, now, result):
    prefs = settings_for(organisation)
    if not prefs.digest_enabled:
        return
    local = now.astimezone(zone(prefs))
    if local.hour < prefs.digest_hour or local.weekday() not in working(prefs):
        return
    day = local.date()
    for user in _members_due(organisation, day):
        row = _claim(user, day)
        if row is None:
            continue
        try:
            built = contents(user, today=day)
            if built is None:
                row.status = DigestSend.Status.EMPTY
                result.empty += 1
            else:
                send_work_digest(user, *built)
                result.sent += 1
        except Exception as exc:  # noqa: BLE001 - one person never stops the rest
            logger.warning("work digest: user %s failed: %s", user.pk, type(exc).__name__)
            row.status = DigestSend.Status.FAILED
            result.failed += 1
        row.save(update_fields=["status"])


def send_due(now=None):
    """Every digest that is due now. See the module."""
    global _told_unready
    from services.accounts.models import Organisation
    from services.customers.models import Customer

    now = now or timezone.now()
    result = DigestResult()
    if not email_ready():
        if not _told_unready:
            logger.info("work digest: email isn't set up on this server; digests skipped")
            _told_unready = True
        result.skipped = True
        return result
    workspaces = Organisation.objects.filter(
        id__in=Customer.objects.values("organisation_id")
    ).exclude(work_settings__digest_enabled=False)
    for organisation in workspaces.order_by("id"):
        try:
            _send_workspace(organisation, now, result)
        except Exception as exc:  # noqa: BLE001 - one workspace never stops the next
            logger.warning(
                "work digest: organisation %s failed: %s", organisation.pk, type(exc).__name__
            )
            result.failed += 1
    return result
```

Note: `send_work_digest` is imported into `digest`'s namespace on purpose, so the test patches `digest.send_work_digest`. The subject follows the contract: the non-zero overdue and due-today counts, else recommendations waiting, else (only Blocked work) "N blocked".

- [ ] **Step 6: Call it every minute**

In `deliver_pending.py`, import and call it after the surveys, never fatal:

```python
from services.work.digest import send_due as send_digests
```

```python
        try:
            digests = send_digests(now=now)
            sent, digests_failed = digests.sent, digests.failed
        except Exception as exc:  # noqa: BLE001 - campaign and survey sends already ran
            self.stdout.write(self.style.WARNING(f"digests skipped: {type(exc).__name__}"))
            sent, digests_failed = 0, 0
        if sent or digests_failed:
            self.stdout.write(f"Sent {sent} work digest(s); {digests_failed} failed.")
```

Update its docstring: "and Work's daily digests that are due (services.work.digest)".

- [ ] **Step 7: Run the tests**

Run: `venv/bin/python manage.py test services.work services.campaigns services.surveys --parallel auto --noinput`
Expected: PASS. If `test_carl_gets_his_own_work`'s counts differ, print `today.build(carl, today=self.today)["counts"]` and fix the test's expectation only if it disagrees with WorkFixture's docstring (overdue 1: "Call Pizza Hut"; today 1; blocked 1; "West handover" hidden).

- [ ] **Step 8: Commit**

```bash
git add services/work/models.py services/work/migrations/0003_digestsend.py services/work/digest.py services/email.py services/campaigns/management/commands/deliver_pending.py services/work/tests/test_digest.py
git commit -m "feat(work): a daily digest email, once per person per local day, skipped without SMTP

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Privacy and query shape over the new modules

**Files:**
- Modify: `services/work/tests/test_queries.py`
- Modify: `services/work/tests/test_privacy.py`

- [ ] **Step 1: Add the tests**

In `test_queries.py`, `QueryShapeTests`:

```python
    def test_no_distinct_in_tracking_or_the_digest(self):
        from datetime import UTC, datetime, time

        from services.work import digest, tracking
        from services.work.models import WorkSettings

        WorkSettings.objects.filter(pk=prefs.settings_for(self.org).pk).update(
            working_days=[0, 1, 2, 3, 4, 5, 6]
        )
        org = Organisation.objects.get(pk=self.org.pk)
        now = datetime.combine(self.today, time(10, 0), tzinfo=UTC)
        with CaptureQueriesContext(connection) as queries:
            tracking.run(org, now=now)
            digest.send_due(now)
            for reader in (self.csm, self.mona, self.admin, self.lee):
                digest.contents(User.objects.get(pk=reader.pk), today=self.today)
        offenders = [q["sql"] for q in queries if "DISTINCT" in q["sql"].upper()]
        self.assertEqual(offenders, [])
```

In `test_privacy.py`, add a class proving each reader's digest is counted, not named:

```python
class DigestPrivacyTests(WorkFixture):
    def test_each_reader_sees_only_what_they_open(self):
        from services.work.digest import contents

        carl = contents(User.objects.get(pk=self.csm.pk), today=self.today)
        self.assertNotIn("West handover", carl[1])
        alice = contents(User.objects.get(pk=self.admin.pk), today=self.today)
        # Alice is assigned nothing: no task is named to her, only what she may decide.
        self.assertTrue(alice is None or "Call Pizza Hut" not in alice[1])
        self.assertIsNone(contents(User.objects.get(pk=self.stranger.pk), today=self.today))
```

(Add `from services.accounts.models import User` and `from services.work.tests.fixtures import WorkFixture` to its imports if missing.)

- [ ] **Step 2: Run them**

Run: `venv/bin/python manage.py test services.work.tests.test_queries services.work.tests.test_privacy --parallel auto --noinput`
Expected: PASS (if a DISTINCT shows up, rewrite that filter as an `id__in` subquery; never weaken the test).

- [ ] **Step 3: Commit**

```bash
git add services/work/tests/test_queries.py services/work/tests/test_privacy.py
git commit -m "test(work): tracking and the digest stay DISTINCT-free and counted-not-named

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Docs, full suite, lint

**Files:**
- Modify: `docs/API_CONTRACTS.md` (Work settings fields, `/auth/me/` `digest_opt_out`, the two notification kinds, the `nudged`/`escalated` event data). Follow the api-contracts skill.
- Modify: `docs/product/01-prd.md` (Work: tracking and digest shipped; SMTP still the owner's), `02-trd.md` (clock, tracking in `run_health_maintenance`, digest in `deliver_pending`, once-only claims), `05-backend-schema.md` (WorkSettings fields, Task `last_nudged_at`/`escalated_at`, `DigestSend`, `User.digest_opt_out`, the two Notification kinds), `06-implementation-plan.md` (delivery 3 done).
- Modify: `services/notifications/models.py` docstring is already updated (Task 3).

- [ ] **Step 1: Update the docs** (prose; keep any Python in Markdown fences `ruff format`-clean).

- [ ] **Step 2: Full suite, lint, migrations check**

Run:
```bash
venv/bin/python manage.py makemigrations --check --dry-run
venv/bin/ruff check .
venv/bin/ruff format --check .
venv/bin/python manage.py test --parallel auto --noinput
```
Expected: "No changes detected", lint clean, every test OK.

- [ ] **Step 3: Apply the migrations locally** (the shared dev DB; delivery 2's are applied already)

Run: `venv/bin/python manage.py migrate`
Expected: applies `accounts 0014`, `customers 0057`, `notifications 0009`, `work 0002`, `work 0003`.

- [ ] **Step 4: Commit**

```bash
git add docs/API_CONTRACTS.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md docs/product/06-implementation-plan.md
git commit -m "docs: Work delivery 3, tracking that pushes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Self-review notes

- Spec §3.1 → Tasks 1, 3, 5, 6. §3.2 nudge/escalate → Task 4; digest → Task 6; timezone → Task 1. §3.3 backend half (`email_ready`, fields) → Task 2. §4 → Tasks 4, 6, 7. §5 (deactivated, reassign, completed, run twice, weekends) → Tasks 3, 4. §6 tracking and Postgres 16 → Tasks 4, 6, 7. Docs → Task 8.
- Names used across tasks: `clock.working(prefs)`, `clock.zone(prefs)`, `clock.working_days_between`, `prefs.email_ready`, `tracking.plural`, `digest.contents`, `DigestSend.Status.{PENDING,SENT,EMPTY,FAILED}`; `send_work_digest` lives in `services.email` and is imported into `digest`.
