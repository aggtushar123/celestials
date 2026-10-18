"""What Revenact recommends from (Work round §2.2): one function per kind,
each reading the workspace as the workspace itself (`SystemActor`) and
returning a `Signal` for every record whose signal triggers. Rules over
data, no AI.

The facts are sentences about the record itself and counts: never another
record's name, a ticket's text, or an anomaly's model-written title. Every
title is Revenact's own words, naming only the record. A recommendation is
shown only to people who may open its record (spec §4).

Every query is a plain filter or an `id IN` list, never a join made unique
with DISTINCT (Postgres 16; tests/test_queries.py)."""

from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Min, OuterRef, Subquery

from services.attention.rules import SUPPORT_PRIORITIES
from services.customers.models import Account, Customer, HealthSnapshot, Ticket
from services.customers.scoping import SystemActor, live_customers

from .models import Recommendation

K = Recommendation.Kind


@dataclass(frozen=True)
class Signal:
    """One record whose signal triggers: what a recommendation is made from.
    `account` is set for an account's own signal, with `customer` its first
    organisation; `agent_action` only for the agents'."""

    kind: str
    customer: object
    account: object
    title: str
    facts: tuple
    evidence: tuple
    value: float | None
    agent_action: object = None

    @property
    def record(self):
        return self.customer if self.account is None else self.account

    @property
    def key(self):
        """What one open recommendation is kept per: the record, or the action."""
        if self.agent_action is not None:
            return ("agent_action", self.agent_action.pk)
        return (self.customer.pk, None if self.account is None else self.account.pk)


@dataclass(frozen=True)
class Book:
    """The workspace as one refresh reads it, loaded once for every source."""

    organisation: object
    today: object
    now: object
    customers: dict
    accounts: dict
    parent_of: dict


def load_book(organisation, *, today, now):
    """Live, unchurned organisations, their unchurned accounts, and each
    account's first (lowest-id) live organisation."""
    # SOC2:AUTH-02 a scheduled job reads as the workspace itself, never as a person
    live = live_customers(SystemActor(organisation)).exclude(
        lifecycle_stage=Customer.LifecycleStage.CHURN
    )
    customers = {customer.pk: customer for customer in live.select_related("owner")}
    links = (
        Account.customers.through.objects.filter(customer_id__in=live.values("id"))
        .order_by("account_id", "customer_id")
        .values_list("account_id", "customer_id")
    )
    parent_of = {}
    for account_id, customer_id in links:
        if customer_id in customers:
            parent_of.setdefault(account_id, customers[customer_id])
    accounts = {
        account.pk: account
        for account in Account.objects.filter(id__in=sorted(parent_of))
        .exclude(lifecycle_stage=Customer.LifecycleStage.CHURN)
        .select_related("owner")
    }
    parent_of = {pk: parent for pk, parent in parent_of.items() if pk in accounts}
    return Book(organisation, today, now, customers, accounts, parent_of)


def record_link(record):
    if isinstance(record, Customer):
        return f"/organizations/{record.pk}"
    return f"/accounts/{record.pk}"


def plural(count, word, words=None):
    return f"{count} {word if count == 1 else (words or word + 's')}"


def day(value):
    return f"{value.day} {value:%b}"


def ago(days):
    return "today" if days <= 0 else f"{plural(days, 'day')} ago"


def _signal(book, record, *, kind, title, facts, value, evidence=()):
    if isinstance(record, Account):
        customer, account = book.parent_of[record.pk], record
    else:
        customer, account = record, None
    return Signal(
        kind=kind,
        customer=customer,
        account=account,
        title=title[:255],
        facts=tuple(facts),
        evidence=({"label": record.name, "link": record_link(record)}, *evidence),
        value=None if value is None else float(value),
    )


def _counted(book, queryset, oldest):
    """(record, count, oldest value) for every organisation and account
    `queryset` has rows on: one GROUP BY each, no DISTINCT."""
    for field, rows in (("customer_id", book.customers), ("account_id", book.accounts)):
        counted = (
            queryset.filter(**{f"{field}__in": sorted(rows)})
            .order_by()
            .values(field)
            .annotate(count=Count("id"), oldest=Min(oldest))
        )
        for row in counted:
            yield rows[row[field]], row["count"], row["oldest"]


def _renews(days):
    if days > 0:
        return f"Renews in {plural(days, 'day')}"
    if days == 0:
        return "Renews today"
    return f"Renewal is {plural(-days, 'day')} overdue"


def renewal_due(book, params):
    """A renewal within `days`, or already overdue."""
    horizon = book.today + timedelta(days=params["days"])
    found = []
    for record in [*book.customers.values(), *book.accounts.values()]:
        renews = record.renewal_date
        if renews is None or renews > horizon:
            continue
        days = (renews - book.today).days
        found.append(
            _signal(
                book,
                record,
                kind=K.RENEWAL_DUE,
                title=f"Prepare {record.name}'s renewal",
                facts=(_renews(days), f"Renewal date {day(renews)}"),
                value=days,
            )
        )
    return found


def health_drop(book, params):
    """Health now at least `drop` below the latest reading captured on or
    before `window_days` ago (the job writes month-ends, so it may be
    older). No earlier reading, no signal."""
    cutoff = book.today - timedelta(days=params["window_days"])
    drop = Decimal(str(params["drop"]))
    found = []
    for model, field, rows in (
        (Customer, "customer", book.customers),
        (Account, "account", book.accounts),
    ):
        earlier = HealthSnapshot.objects.filter(
            **{field: OuterRef("pk")}, captured_on__lte=cutoff
        ).order_by("-captured_on", "-id")
        readings = (
            model.objects.filter(id__in=sorted(rows))
            .annotate(
                then=Subquery(earlier.values("health_score")[:1]),
                then_on=Subquery(earlier.values("captured_on")[:1]),
            )
            .values_list("id", "then", "then_on")
        )
        for pk, then, then_on in readings:
            record = rows[pk]
            if then is None or then - record.health_score < drop:
                continue
            found.append(
                _signal(
                    book,
                    record,
                    kind=K.HEALTH_DROP,
                    title=f"Find out why {record.name}'s health fell",
                    facts=(f"Health fell {then} → {record.health_score} since {day(then_on)}",),
                    value=then - record.health_score,
                )
            )
    return found


def urgent_tickets(book, params):
    """At least `min` open tickets at the support priorities (critical and
    high: attention.rules). Counted; a ticket's own words are never copied."""
    urgent = Ticket.objects.filter(priority__in=SUPPORT_PRIORITIES).exclude(
        status__in=Ticket.RESOLVED_STATUSES
    )
    found = []
    for record, count, oldest in _counted(book, urgent, "opened_at"):
        if count < params["min"]:
            continue
        found.append(
            _signal(
                book,
                record,
                kind=K.URGENT_TICKETS,
                title=f"Get {record.name}'s urgent tickets moving",
                facts=(
                    f"{plural(count, 'urgent ticket')} open",
                    f"Oldest opened {ago((book.today - oldest).days)}",
                ),
                value=count,
            )
        )
    return found


def anomaly(book, params):
    """A live anomaly whose evidence names the record. The anomaly's title
    is model-written from the whole workspace's reports
    (anomalies.views.title_for), so it is never copied; distinct anomalies
    are counted here, not with COUNT(DISTINCT)."""
    from services.anomalies.models import Anomaly, AnomalyEvidence

    rows = AnomalyEvidence.objects.filter(
        organisation=book.organisation, anomaly__status=Anomaly.Status.LIVE
    ).values_list("customer_id", "account_id", "anomaly_id", "anomaly__last_seen_at")
    named = {}
    for customer_id, account_id, anomaly_id, last_seen in rows:
        if account_id is None:
            record = book.customers.get(customer_id)
        else:
            record = book.accounts.get(account_id)
        if record is None:
            continue
        entry = named.setdefault(
            (type(record).__name__, record.pk), {"record": record, "ids": set(), "last": last_seen}
        )
        entry["ids"].add(anomaly_id)
        entry["last"] = max(entry["last"], last_seen)
    return [
        _signal(
            book,
            entry["record"],
            kind=K.ANOMALY,
            title=f"Check {entry['record'].name} against a live anomaly",
            facts=(
                f"Named in {plural(len(entry['ids']), 'live anomaly', 'live anomalies')}",
                f"Last seen {ago((book.now - entry['last']).days)}",
            ),
            value=len(entry["ids"]),
            evidence=({"label": "Anomalies", "link": "/brain/anomalies"},),
        )
        for entry in named.values()
    ]


#: kind -> source, in `Recommendation.Kind` order.
SOURCES = {
    K.RENEWAL_DUE: renewal_due,
    K.HEALTH_DROP: health_drop,
    K.URGENT_TICKETS: urgent_tickets,
    K.ANOMALY: anomaly,
}
