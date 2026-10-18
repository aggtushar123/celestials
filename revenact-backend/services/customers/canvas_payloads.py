"""Maps as the API returns them (spec §1.3, §4): rows for the lists, and the
whole map with each person's facts worked out now, for the reader. Every fact
is read under the reader's own rules, in a fixed number of queries whatever
the number of people on the map. Nothing here writes."""

from functools import reduce
from operator import or_

from django.db.models import BooleanField, ExpressionWrapper, Max, Q
from django.utils import timezone

from services.accounts.hierarchy import subtree_ids
from services.agents.made_by import RELATED, made_by
from services.campaigns.paging import decode_after, encode, page
from services.mail.visibility import visible_emails_q
from services.organizations.rows import iso, person
from services.plans.access import visible_plans
from services.plans.models import OPEN
from services.plans.payloads import plan_rows, record_ref
from services.surveys.access import readable_sends
from services.surveys.models import SurveyInvite

from .canvas import record_contacts_q, stored_edges, stored_nodes
from .models import Call, Canvas, Contact, Email
from .scoping import customer_rollup_q, visible_accounts, visible_children_q, visible_customers

GALLERY_PAGE = 50
RECORD_LIMIT = 100
NOT_ON_MAP_LIMIT = 200
OPEN_PLANS_LIMIT = 50
#: A search is cut to this many characters.
MAX_QUERY = 120
ROW_RELATED = ("customer", "account", "updated_by", RELATED)
DETAIL_RELATED = ("customer", "account", "created_by", "updated_by", RELATED)
ROLE_LABELS = dict(Contact.Role.choices)
SENTIMENT_LABELS = dict(Contact.Sentiment.choices)


def visible_canvases(user):
    """Maps on records `user` may open. Two `id IN` subqueries: never joins
    de-duplicated with DISTINCT, which PostgreSQL 16 planned at about a
    second a call (#86)."""
    # SOC2:AUTH-02 a map is read and edited by whoever may open its record
    return Canvas.objects.filter(
        Q(customer_id__in=visible_customers(user).values("pk"))
        | Q(account_id__in=visible_accounts(user).values("pk"))
    )


def can_delete(user, canvas):
    """The creator and anyone above them; with no creator, anyone who may
    open the record (the caller already may)."""
    creator = canvas.created_by_id
    # SOC2:AUTH-02 deleting a map is its creator's and their management chain's
    return creator is None or creator == user.pk or creator in subtree_ids(user)


def canvas_row(canvas, nodes=None):
    """A `CanvasRow`. Needs `ROW_RELATED` loaded."""
    nodes = stored_nodes(canvas.nodes) if nodes is None else nodes
    return {
        "id": canvas.pk,
        "name": canvas.name,
        "record": record_ref(canvas),
        "people": len(nodes),
        "updated_at": iso(canvas.updated_at),
        "updated_by": person(canvas.updated_by),
        "made_by": made_by(canvas),
    }


def gallery_page(user, params):
    """`GET canvases/`: newest edit first, 50 a page under an opaque cursor;
    a malformed one reads as the first page."""
    canvases = visible_canvases(user).select_related(*ROW_RELATED)
    q = (params.get("q") or "").strip()[:MAX_QUERY]
    if q:
        canvases = canvases.filter(
            Q(name__icontains=q) | Q(customer__name__icontains=q) | Q(account__name__icontains=q)
        )
    canvases = canvases.order_by("-updated_at", "-pk")
    after = decode_after(params.get("cursor"))
    if after is not None:
        at, pk = after
        canvases = canvases.filter(Q(updated_at__lt=at) | Q(updated_at=at, pk__lt=pk))
    rows, more = page(canvases, GALLERY_PAGE)
    cursor = encode(rows[-1].updated_at, rows[-1].pk) if more else None
    return {"results": [canvas_row(canvas) for canvas in rows], "next": cursor}


def record_rows(user, *, customer=None, account=None):
    """A record's maps, newest edit first, at most 100. An organisation's
    include those on its accounts the reader may open (`customer_rollup_q`).
    The caller has already resolved the record as one the reader may open."""
    where = customer_rollup_q(user, customer) if customer is not None else Q(account=account)
    canvases = (
        Canvas.objects.filter(where)
        .select_related(*ROW_RELATED)
        .order_by("-updated_at", "-pk")[:RECORD_LIMIT]
    )
    return {"results": [canvas_row(canvas) for canvas in canvases]}


def _last_contacted(user, people, now):
    """{contact id: the latest call they were on, or email from or to their
    address, that `user` may read, up to `now`}. Two queries however many
    people: one for calls, one aggregate for every address at once."""
    # SOC2:AUTH-02 calls on records the reader may open (a call has no rule of its own)
    calls = Call.objects.filter(visible_children_q(user), occurred_at__lte=now).values("pk")
    latest = dict(
        Call.participants.through.objects.filter(
            contact_id__in=[p["pk"] for p in people], call_id__in=calls
        )
        .order_by()
        .values("contact_id")
        .annotate(at=Max("call__occurred_at"))
        .values_list("contact_id", "at")
    )
    spellings = {}
    for p in people:
        if p["email"]:
            spellings.setdefault(p["email"].lower(), set()).update({p["email"], p["email"].lower()})
    if not spellings:
        return latest
    aliases = {address: f"a{index}" for index, address in enumerate(sorted(spellings))}
    wanted, matches = {}, []
    for address, alias in aliases.items():
        match = Q(from_address__iexact=address)
        for spelling in sorted(spellings[address]):
            match |= Q(to_addresses__contains=[spelling])
        matches.append(match)
        wanted[alias] = Max("sent_at", filter=match)
    # SOC2:AUTH-02 mail under its own rule (mailbox owner and chain) and its record's
    found = (
        Email.objects.filter(visible_children_q(user))
        .filter(visible_emails_q(user))
        .filter(sent_at__lte=now)
        # This OR is a row filter, not an index path (`from_address` has none,
        # `to_addresses` has no GIN index), so a map load still sequentially
        # scans every visible, dated row — it only keeps the aggregate
        # itself from re-testing addresses against rows that already failed
        # this filter. A later migration can add those indexes if mailboxes
        # grow enough for this to matter (final review, minor #3).
        .filter(reduce(or_, matches))
        .aggregate(**wanted)
    )
    for p in people:
        at = found[aliases[p["email"].lower()]] if p["email"] else None
        if at is not None and (latest.get(p["pk"]) is None or at > latest[p["pk"]]):
            latest[p["pk"]] = at
    return latest


def _latest_surveys(user, contact_ids):
    """{contact id: their latest answer} on records the reader may open,
    from a send the reader may read (`services.surveys.access.readable_sends`
    — the same check a send's own views run before naming an answer): the
    type, score and time only, never the comment."""
    # SOC2:AUTH-02 an answer follows its record's visibility and its send's own readers
    rows = (
        SurveyInvite.objects.filter(contact_id__in=contact_ids, status=SurveyInvite.Status.ANSWERED)
        .filter(visible_children_q(user))
        .filter(send_id__in=readable_sends(user).values("pk"))
        .order_by("contact_id", "-answered_at", "-pk")
        .distinct("contact_id")
        .values_list("contact_id", "send__survey_type", "score", "answered_at")
    )
    return {
        contact_id: {"type": kind, "score": score, "answered_at": iso(at)}
        for contact_id, kind, score, at in rows
    }


def _person(row, contacted, surveys):
    return {
        "name": row["name"],
        "role": row["role"],
        "role_display": ROLE_LABELS.get(row["role"], ""),
        "sentiment": row["sentiment"] or None,
        "sentiment_label": SENTIMENT_LABELS.get(row["sentiment"]),
        "last_contacted_at": iso(contacted.get(row["pk"])),
        "latest_survey": surveys.get(row["pk"]),
        "campaigns_unsubscribed": row["campaigns_unsubscribed_at"] is not None,
    }


def _open_plans(user, canvas, today):
    on = (
        {"customer_id": canvas.customer_id}
        if canvas.customer_id is not None
        else {"account_id": canvas.account_id}
    )
    plans = (
        visible_plans(user)
        .filter(status__in=OPEN, **on)
        .select_related("customer", "account", "owner")
        .order_by("-created_at", "-pk")[:OPEN_PLANS_LIMIT]
    )
    return plan_rows(plans, user, today=today)


def canvas_payload(canvas, user, *, now=None, today=None):
    """The whole map for `user` (a `Canvas`). Needs `DETAIL_RELATED` loaded."""
    now = now or timezone.now()
    today = today or timezone.localdate()
    nodes = stored_nodes(canvas.nodes)
    edges = stored_edges(canvas.edges, nodes)
    on_map = {node["data"]["contact_id"] for node in nodes}
    seen = Q(pk__in=Contact.objects.filter(visible_children_q(user)).values("pk"))
    # SOC2:AUTH-02 a contact from outside the reader's own organisation reads
    # as removed, never hidden — an id__in subquery, not a join, so a
    # contact's own organisation can't fan out the outer query
    in_organisation = Q(pk__in=on_map) & (
        Q(customer__organisation=user.organisation)
        | Q(account__customers__organisation=user.organisation)
    )
    # SOC2:AUTH-02 a person the reader may not open is listed by node id only, never named
    rows = list(
        Contact.objects.filter(pk__in=Contact.objects.filter(in_organisation).values("pk")).values(
            "pk",
            "name",
            "role",
            "sentiment",
            "email",
            "campaigns_unsubscribed_at",
            seen=ExpressionWrapper(seen, output_field=BooleanField()),
        )
    )
    existing = {row["pk"]: row for row in rows}
    visible = [row for row in rows if row["seen"]]
    contacted = _last_contacted(user, visible, now) if visible else {}
    surveys = _latest_surveys(user, [row["pk"] for row in visible]) if visible else {}
    record = record_contacts_q(customer_id=canvas.customer_id, account_id=canvas.account_id)
    # SOC2:AUTH-02 the tray lists only people the reader may open
    tray = (
        Contact.objects.filter(record)
        .filter(visible_children_q(user))
        .exclude(pk__in=on_map)
        .order_by("name", "pk")
        .values("pk", "name", "role")[:NOT_ON_MAP_LIMIT]
    )
    return {
        **canvas_row(canvas, nodes),
        "version": canvas.version,
        "nodes": nodes,
        "edges": edges,
        "people_by_contact": {str(row["pk"]): _person(row, contacted, surveys) for row in visible},
        "hidden": [
            node["id"]
            for node in nodes
            if node["data"]["contact_id"] in existing
            and not existing[node["data"]["contact_id"]]["seen"]
        ],
        "removed": [node["id"] for node in nodes if node["data"]["contact_id"] not in existing],
        "not_on_map": [
            {
                "id": row["pk"],
                "name": row["name"],
                "role": row["role"],
                "role_display": ROLE_LABELS.get(row["role"], ""),
            }
            for row in tray
        ],
        "open_plans": _open_plans(user, canvas, today),
        "can_delete": can_delete(user, canvas),
        "created_by": person(canvas.created_by),
    }
