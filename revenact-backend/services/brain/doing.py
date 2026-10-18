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
checks this module's own section queries (rules, plans) for DISTINCT.
Initiative progress is not covered by that guarantee: `initiative_items`
reads `services.metrics.initiatives.Figures`, which reuses the metric
registry's own rollups (`services.metrics.registry`) — including
`services.customers.forecast`'s `.distinct()` over the Opportunity/
Risk-to-Account M2M, a legitimate dedup of a fan-out join, not a visibility
filter, and pre-existing dashboard machinery this module doesn't own. For a
reader who can't use Company, progress is their own read of each cut
person's book (`Books`): each needed source runs once per distinct person on
the page, so the cost follows the people cut, not the rows."""

from collections import defaultdict
from datetime import datetime, time, timedelta

from django.db.models import (
    Case,
    Count,
    DateField,
    DateTimeField,
    F,
    IntegerField,
    OuterRef,
    Q,
    Subquery,
    Value,
    When,
)
from django.db.models.functions import Coalesce
from django.utils import timezone

from services.accounts.hierarchy import subtree_ids
from services.customers.models import Account, Customer, Task
from services.customers.personal import visible_tasks
from services.customers.scoping import sees_everything, visible_accounts, visible_customers
from services.fx_rates.conversion import rates_for
from services.metrics.initiatives import Figures, progress
from services.metrics.models import Initiative
from services.metrics.registry import BY_KEY, OWNER, compute_value
from services.metrics.signals import number
from services.plans.access import visible_plans
from services.plans.figures import record_figures
from services.plans.models import OPEN, Milestone, Plan
from services.rules.access import readable_rules
from services.rules.models import Rule, RuleRun
from services.rules.payloads import tallies

from .initiatives import edited_as, trackable
from .scope import COMPANY, available, book_actor

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


def figures_shown(initiative, desk):
    """Whether a row may carry its figures: always for a reader who can use
    Company (`desk` None); otherwise only when the initiative tracks a desk
    person's own book (their owner cut)."""
    if desk is None:
        return True
    return initiative.dimension == OWNER and initiative.member in desk


class Books:
    """Each cut person's book as the reader reads it (`book_actor`), for a
    reader who can't use Company: per request, each distinct person's
    sources run once, and only the sources the page's metrics need — so a
    page's cost grows with the people cut, never with the rows."""

    def __init__(self, reader):
        self.reader = reader
        self._sources = {}

    def value_of(self, initiative):
        metric = BY_KEY.get(initiative.metric)
        if metric is None:
            return None
        member = initiative.member
        if member not in self._sources:
            self._sources[member] = (book_actor(self.reader, member), {})
        actor, sources = self._sources[member]
        return number(compute_value(self.reader.organisation, metric, actor, sources))


def baseline_readable(initiative, reader):
    """A reader without Company may see the stored baseline only when it is
    their own read of the book: started from the Brain (`baseline_scope`
    book) by them."""
    return (
        initiative.baseline_scope == Initiative.BaselineScope.BOOK
        and initiative.created_by_id == reader.pk
    )


def progress_of(initiative, figures, books, today):
    """The row's progress. A Company reader (`books` None) reads the
    registry's organisation-wide figures. Anyone else reads the cut
    person's book as themselves; the stored baseline only when it is their
    own read (`baseline_readable`), else null, and then no `progress_pct`
    and a `direction` from the metric's `better`."""
    if books is None:
        return progress(initiative, figures.value_of(initiative), today)
    shown = progress(initiative, books.value_of(initiative), today)
    # SOC2:AUTH-02 a baseline someone else read (the organisation, or another
    # person's rights) never reaches a reader who can't use Company, nor
    # does its relation to the target
    if not baseline_readable(initiative, books.reader):
        shown["baseline"] = None
        shown["progress_pct"] = None
        shown["direction"] = "up" if shown["better"] == "up" else "down"
    return shown


def _initiative(initiative, figures, books, today, tasks, can_edit, shown):
    metric = BY_KEY.get(initiative.metric)
    cut = None
    if initiative.dimension and shown:
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
        "progress": progress_of(initiative, figures, books, today) if shown else None,
        "work": {
            "open": initiative.open_tasks,
            "done": initiative.done_tasks,
            "tasks": [_task_row(task) for task in tasks],
        },
        "can_edit": can_edit,
    }


def desk_people(reader):
    """None for a reader who can use Company, so organisation-wide registry
    figures are shown; otherwise the reader's own desk — themself and
    everyone below them in the chart — as strings, to match a metric cut's
    `member` (an owner id). Shared with `brain/graph.py`'s `figures_shown`
    cut, so the dashboard and the graph withhold the same label."""
    if COMPANY in available(reader):
        return None
    return {str(pk) for pk in {reader.pk, *subtree_ids(reader)}}


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
    # SOC2:AUTH-02 progress figures and the cut's label are organisation-wide
    # registry figures: outside a desk person's own book they go only to a
    # reader who can use Company; the row itself stays (decision 2)
    desk = desk_people(reader)
    # SOC2:AUTH-02 inside a desk person's book, figures are the reader's own
    # read of it (`Books`), never the registry's organisation-wide slice
    books = None if desk is None else Books(reader)
    return [
        _initiative(
            row,
            figures,
            books,
            today,
            tasks.get(row.pk, []),
            edited_as(reader, row, below=below, everything=everything) is not None,
            figures_shown(row, desk),
        )
        for row in rows
    ]


def initiative_payload(reader, pk, today):
    """One initiative as a row of `doing/`: what POST and PATCH return.

    This only scopes by organisation and id — it is not a visibility check.
    The caller must already have found and authorized the initiative (the
    create path for the reader's own book, `edited_as` for a PATCH) before
    calling this; it raises `ValueError` (unpacking) if `pk` doesn't exist
    in the reader's organisation, and does not distinguish "missing" from
    "someone else's tenant"."""
    rows = Initiative.objects.filter(organisation_id=reader.organisation_id, pk=pk)
    (row,) = initiative_items(reader, rows, Figures(reader.organisation), today)
    return row


# ── Plans ────────────────────────────────────────────────────────────────

PLAN_RANK = Case(
    When(status=Plan.Status.AT_RISK, then=Value(0)),
    When(status=Plan.Status.ON_TRACK, then=Value(1)),
    When(status=Plan.Status.NOT_STARTED, then=Value(2)),
    default=Value(3),
    output_field=IntegerField(),
)


#: When a closed plan closed: done at its `done_at`; cancelled at its last
#: change (`updated_at` — the plan keeps no cancel timestamp), so a plan that
#: went done -> cancelled sorts and ages by the cancel, not the older done.
CLOSED_ON = Case(
    When(status=Plan.Status.DONE, then=F("done_at")),
    When(status=Plan.Status.CANCELLED, then=F("updated_at")),
    default=None,
    output_field=DateTimeField(),
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
        links = Account.customers.through.objects
        under = links.filter(customer_id__in=customers).values("account_id")
        # An account belongs to an organisation through its customers.
        ours = links.filter(customer__organisation_id=reader.organisation_id).values("account_id")
        accounts = (
            Account.objects.filter(id__in=ours)
            .filter(Q(owner_id__in=owners) | Q(id__in=under))
            .values("id")
        )
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
            closed_on=CLOSED_ON,
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


# ── Rules at work ────────────────────────────────────────────────────────


def rules_in(reader, scope):
    """Rules owned by someone on the desk (Company: every rule)."""
    rules = Rule.objects.filter(organisation_id=reader.organisation_id)
    owners = owners_of(scope)
    return rules if owners is None else rules.filter(owner_id__in=owners)


def _skipped(run):
    return sum(int(n) for n in (run.skipped or {}).values())


#: What a paused rule says when its stored code is no longer a known one.
PAUSED = "It is paused."


def paused_message(code):
    """The pause's sentence; null when not paused, a plain one for a code no
    longer among the choices."""
    if not code:
        return None
    return dict(Rule.Paused.choices).get(code, PAUSED)


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
        "paused_message": paused_message(rule.paused_reason),
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
    only what the reader may open; `hidden` is the scope's plans they can't.
    An initiative off the desk's own books carries no figures unless the
    reader can use Company (`figures_shown`)."""
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
