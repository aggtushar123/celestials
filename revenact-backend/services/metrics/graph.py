"""The knowledge graph: the brain's real relations, drawn once.

Who owns what, what runs on which product, where the risk sits, and what
has already been decided about it — as one graph a manager can walk from
"Product B is carrying the downside" to the accounts on it, the owner
who holds them, the initiative already open on that number and the
proposals waiting in the queue. Nothing here is a new fact: every node
and edge is a row or a foreign key the product already has, and every
figure comes from the same rollup the dashboards draw (the forecast rows
for ARR and downside, the health category from the customer).

Five node kinds — owner, customer, product, initiative, proposal — and
edges only where a real relation exists: a customer's owner and primary
product, an initiative's cut member (a product or an owner), a task
proposal's account, a proposal's linked initiative.
"""

from django.db.models import Count

from services.customers import forecast
from services.customers.models import Task
from services.customers.scoping import SystemActor

from .legacy import LEGACY_KIND
from .models import AgentAction, Initiative
from .registry import BY_KEY, OWNER, PRODUCT, as_of
from .signals import number

CUSTOMER_LIMIT = 200


def _node(kind, pk, label, **figures):
    return {"id": f"{kind}:{pk}", "kind": kind, "label": label, **figures}


def _edge(source, target, kind):
    return {"from": source, "to": target, "kind": kind}


def customer_part(organisation, customers, viewer, *, tasks=None):
    """Customer, product and owner nodes for `customers`, their figures the
    forecast's as `viewer` counts them, capped at CUSTOMER_LIMIT by ARR.
    `open_tasks` counts open tasks among `tasks` (default: every task).
    Returns `(nodes, edges, products, owners, customer_ids)`."""
    rows = forecast.build_rows(
        list(customers), organisation, viewer=viewer, horizon=forecast.horizon_days({})
    )
    rows.sort(key=lambda r: -r.arr)
    rows = rows[:CUSTOMER_LIMIT]
    tasks = Task.objects.all() if tasks is None else tasks
    open_tasks = {
        t["customer_id"]: t["n"]
        for t in tasks.filter(customer__in=[r.customer for r in rows])
        .exclude(status=Task.Status.COMPLETED)
        .values("customer_id")
        .annotate(n=Count("id"))
    }

    nodes, edges = [], []
    products, owners = {}, {}
    for row in rows:
        c = row.customer
        nodes.append(
            _node(
                "customer",
                c.id,
                c.name,
                arr=round(row.arr, 2),
                downside=round(row.downside, 2),
                risk=row.risk,
                health_category=c.health_category,
                health_score=number(c.health_score),
                days_to_renewal=row.days_to_renewal,
                open_tasks=open_tasks.get(c.id, 0),
            )
        )
        if c.primary_product_id:
            p = products.setdefault(
                c.primary_product_id,
                {"label": c.primary_product.name, "customers": 0, "arr": 0.0, "downside": 0.0},
            )
            p["customers"] += 1
            p["arr"] += row.arr
            p["downside"] += row.downside
            edges.append(_edge(f"customer:{c.id}", f"product:{c.primary_product_id}", "runs_on"))
        if c.owner_id:
            o = owners.setdefault(
                c.owner_id, {"label": c.owner.name, "customers": 0, "arr": 0.0, "downside": 0.0}
            )
            o["customers"] += 1
            o["arr"] += row.arr
            o["downside"] += row.downside
            edges.append(_edge(f"owner:{c.owner_id}", f"customer:{c.id}", "owns"))

    for pk, p in sorted(products.items(), key=lambda kv: -kv[1]["downside"]):
        nodes.append(
            _node(
                "product",
                pk,
                p["label"],
                customers=p["customers"],
                arr=round(p["arr"], 2),
                downside=round(p["downside"], 2),
            )
        )
    for pk, o in sorted(owners.items(), key=lambda kv: -kv[1]["downside"]):
        nodes.append(
            _node(
                "owner",
                pk,
                o["label"],
                customers=o["customers"],
                arr=round(o["arr"], 2),
                downside=round(o["downside"], 2),
            )
        )
    return nodes, edges, products, owners, {r.customer.id for r in rows}


def initiative_part(initiatives, products, owners, *, label_shown=None):
    """Initiative nodes and their `targets` edges. Where
    `label_shown(initiative)` is False, the cut's `member_label` and
    `target_value` are None and no edge names it (default: always shown) —
    the same figures `brain/doing.py`'s `figures_shown` withholds."""
    nodes, edges = [], []
    for i in initiatives:
        metric = BY_KEY.get(i.metric)
        shown = label_shown is None or label_shown(i)
        nodes.append(
            _node(
                "initiative",
                i.id,
                i.title,
                status=i.status,
                metric=i.metric,
                metric_label=metric.label if metric else i.metric,
                member_label=i.member_label if shown else None,
                target_value=number(i.target_value) if shown else None,
                target_by=i.target_by.isoformat(),
                owner=i.owner.name if i.owner_id else None,
            )
        )
        if not shown:
            continue
        if i.dimension == PRODUCT and i.member.isdigit() and int(i.member) in products:
            edges.append(_edge(f"initiative:{i.id}", f"product:{i.member}", "targets"))
        elif i.dimension == OWNER and i.member.isdigit() and int(i.member) in owners:
            edges.append(_edge(f"initiative:{i.id}", f"owner:{i.member}", "targets"))
    return nodes, edges


def proposal_part(proposals, customer_ids, initiative_ids, *, session_title=None):
    """Proposal nodes and their `acts_on` / `serves` edges.
    `session_title(proposal)` names the session a proposal came from
    (default: its conversation's title)."""
    nodes, edges = [], []
    for p in proposals:
        title = None
        if p.session_id:
            title = session_title(p) if session_title is not None else p.session.conversation.title
        nodes.append(
            _node(
                "proposal",
                p.id,
                p.title,
                proposal_kind=LEGACY_KIND.get(p.kind, p.kind),
                from_session=title,
            )
        )
        if p.kind == AgentAction.Kind.TASK_CREATE and p.customer_id in customer_ids:
            edges.append(_edge(f"proposal:{p.id}", f"customer:{p.customer_id}", "acts_on"))
        if p.initiative_id in initiative_ids:
            edges.append(_edge(f"proposal:{p.id}", f"initiative:{p.initiative_id}", "serves"))
    return nodes, edges


def payload(organisation, nodes, edges):
    return {
        "as_of": as_of().isoformat(),
        "currency": organisation.currency,
        "nodes": nodes,
        "edges": edges,
    }


def build_graph(organisation):
    """The whole organisation's graph, read as itself (`/metrics/graph/`)."""
    actor = SystemActor(organisation)
    nodes, edges, products, owners, customer_ids = customer_part(
        organisation, forecast.filtered_customers(actor, {}), actor
    )
    initiatives = list(
        Initiative.objects.filter(
            organisation=organisation,
            status__in=[Initiative.Status.PLANNED, Initiative.Status.ACTIVE],
        ).select_related("owner")
    )
    more, links = initiative_part(initiatives, products, owners)
    nodes, edges = nodes + more, edges + links
    # The Ops agent's two old kinds, as before (Agents round Decision 20).
    proposals = AgentAction.objects.filter(
        organisation=organisation,
        agent=AgentAction.Agent.OPS,
        kind__in=list(LEGACY_KIND),
        status=AgentAction.Status.PROPOSED,
    ).select_related("session__conversation")
    more, links = proposal_part(proposals, customer_ids, {i.id for i in initiatives})
    return payload(organisation, nodes + more, edges + links)
