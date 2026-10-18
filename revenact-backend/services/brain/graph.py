"""The knowledge graph for a Brain scope (spec: react-ts-app docs/
superpowers/specs/2026-10-05-brain-customers-design.md §1.4).

The scope's live customers the reader may open, capped at 200 by ARR,
with figures counted as the reader (as `brain/exposure.py` counts them),
never as the organisation; open tasks only those the reader may read. The
scope's open initiatives (delivery 3's `initiatives_in`), with the cut's
label only where delivery 3 shows it, and its waiting agent actions the
reader may read (delivery 2's desk, Activity's `readable`), of any kind and
agent, the newest 200. `hidden` counts the scope's customers the reader
can't open. Figures reuse the forecast, which reaches an account's organisations
through `id IN` subqueries (`customers.contact.parent_in_q`), so no query
here uses DISTINCT."""

from services.customers import forecast
from services.customers.models import Account, Task
from services.customers.personal import visible_tasks
from services.customers.scoping import visible_customers
from services.metrics.graph import _edge, customer_part, initiative_part, payload

from . import desk
from .doing import OPEN_INITIATIVES, desk_people, figures_shown, initiatives_in

#: The most agent-action nodes drawn, newest first (customers cap at 200 too).
ACTION_LIMIT = 200


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
        # An action on a customer and on one of its accounts points at that
        # organisation once.
        seen = set()
        on = [action.customer_id] if action.customer_id in customer_ids else []
        for customer_id in [*on, *sorted(parents.get(action.account_id, ()))]:
            if customer_id not in seen:
                seen.add(customer_id)
                edges.append(_edge(node, f"customer:{customer_id}", "acts_on"))
        if action.initiative_id in initiative_ids:
            edges.append(_edge(node, f"initiative:{action.initiative_id}", "serves"))
    return nodes, edges


def build(reader, scope, today):
    organisation = reader.organisation
    in_book = forecast.filtered_customers(scope.actor, {})
    # SOC2:AUTH-02 a customer is drawn only if the reader may open it, and
    # its figures are counted as the reader
    shown = in_book.filter(id__in=visible_customers(reader).values("id"))
    # A plain id count, not the annotated forecast queryset's: lighter on
    # Postgres than wrapping `with_health_inputs`'s joins in a COUNT.
    hidden = in_book.values("id").count() - shown.values("id").count()
    # SOC2:AUTH-02 open tasks counted only where the reader may read them
    tasks = visible_tasks(reader, Task.objects.all())
    nodes, edges, products, owners, customer_ids = customer_part(
        organisation, shown, reader, tasks=tasks
    )

    initiatives = list(
        initiatives_in(reader, scope, today)
        .filter(status__in=OPEN_INITIATIVES)
        .select_related("owner")
    )
    people = desk_people(reader)
    # SOC2:AUTH-02 a cut's label goes where delivery 3 shows it (`figures_shown`)
    more, links = initiative_part(
        initiatives, products, owners, label_shown=lambda i: figures_shown(i, people)
    )

    sessions = desk.session_ids_seen_whole(reader)
    # SOC2:AUTH-02 every waiting action the reader may read, of any kind and
    # agent: `readable` is Activity's own rule (drafts by their source too)
    readable = desk.agent_actions(reader, scope, sessions).readable
    # The newest ACTION_LIMIT, drawn oldest first: a bound like the customers'.
    newest = readable.order_by("-created_at", "-id")[:ACTION_LIMIT]
    actions = list(newest)[::-1]
    more_p, links_p = agent_action_part(actions, set(customer_ids), {i.id for i in initiatives})
    out = payload(organisation, nodes + more + more_p, edges + links + links_p)
    out["hidden"] = hidden
    return out
