"""A stakeholder map's rules (spec §1.1, §1.4): what a save may hold, how a
stored map reads back in the contract's shape, and how a map built from the
record's people is laid out. The views lock, save and audit."""

import math

from django.db.models import Case, IntegerField, Q, Value, When
from rest_framework.exceptions import ValidationError

from .models import Account, Contact
from .scoping import visible_children_q

MAX_NODES = 60
MAX_EDGES = 150
MAX_NAME = 120
MAX_ID = 64
MAX_COORDINATE = 1_000_000
LABELS = ("Reports to", "Introduced by", "Blocks", "Influences", "")
ROW_SIZE = 6
GRID_X = 240
GRID_Y = 160
#: The first rows of a map built from people; everyone else shares the last.
ROLE_ROWS = (
    (Contact.Role.DECISION_MAKER, Contact.Role.ECONOMIC_BUYER),
    (Contact.Role.CHAMPION,),
    (Contact.Role.INFLUENCER,),
)

NAME_NEEDED = "Give the map a name."
NAME_TOO_LONG = "Keep the name to 120 characters."
BAD_NODE = "Each person on the map needs an id, a position and a contact."
TOO_MANY_PEOPLE = "A map holds at most 60 people."
NODE_ID_TWICE = "Each person on the map needs their own id."
CONTACT_TWICE = "Someone is on the map twice."
NOT_ON_RECORD = "Add people from this organisation or account."
BAD_EDGE = "Each line needs an id, two people and a label."
TOO_MANY_LINES = "A map holds at most 150 lines."
BAD_LABEL = "Choose Reports to, Introduced by, Blocks, Influences or no label."
EDGE_ENDS = "A line must join two different people on the map."
EDGE_ID_TWICE = "Each line needs its own id."
EDGE_TWICE = "Two people can have each label only once."
CHOOSE_RECORD = "Choose an organisation or an account."
CHOOSE_START = "Choose people or blank."
VERSION_NEEDED = "Send the version you loaded."
CANVAS_CHANGED = "Someone else changed this map. Reload to see their changes."
NOT_DELETER = "Only the map's creator or their managers can delete it."


def record_contacts_q(*, customer_id=None, account_id=None):
    """The contacts of a map's record: an organisation's own and its
    accounts', or an account's own. `id IN` through the link table, no join."""
    if customer_id is not None:
        links = Account.customers.through.objects.filter(customer_id=customer_id)
        return Q(customer_id=customer_id) | Q(account_id__in=links.values("account_id"))
    return Q(account_id=account_id)


def _is_id(value):
    return isinstance(value, str) and 0 < len(value) <= MAX_ID


def _is_coordinate(value):
    return (
        isinstance(value, int | float)
        and not isinstance(value, bool)
        and math.isfinite(value)
        and abs(value) <= MAX_COORDINATE
    )


def _node(raw):
    """`raw` as the contract's node, or None when it is not one."""
    if not isinstance(raw, dict) or not _is_id(raw.get("id")):
        return None
    position, data = raw.get("position"), raw.get("data")
    if not isinstance(position, dict) or not isinstance(data, dict):
        return None
    x, y, contact_id = position.get("x"), position.get("y"), data.get("contact_id")
    if not (_is_coordinate(x) and _is_coordinate(y)):
        return None
    if isinstance(contact_id, bool) or not isinstance(contact_id, int) or contact_id < 1:
        return None
    return {"id": raw["id"], "position": {"x": x, "y": y}, "data": {"contact_id": contact_id}}


def _edge(raw):
    """`raw` as the contract's edge (a missing label is no label), or None."""
    if not isinstance(raw, dict) or not all(
        _is_id(raw.get(key)) for key in ("id", "source", "target")
    ):
        return None
    label = raw.get("label")
    label = "" if label is None else label
    if not isinstance(label, str):
        return None
    return {"id": raw["id"], "source": raw["source"], "target": raw["target"], "label": label}


def stored_nodes(nodes):
    """A stored map's nodes in the contract's shape, for reading. Maps saved
    before live maps hold React Flow's own keys, which are left out; a node
    that is not a person (no contact id), repeats an id, or repeats a
    contact already kept is skipped — first occurrence wins, so a legacy
    map reads back in a shape its own save would accept."""
    if not isinstance(nodes, list):
        return []
    found, seen_ids, seen_contacts = [], set(), set()
    for raw in nodes:
        node = _node(raw)
        if node is None or node["id"] in seen_ids:
            continue
        contact_id = node["data"]["contact_id"]
        if contact_id in seen_contacts:
            continue
        seen_ids.add(node["id"])
        seen_contacts.add(contact_id)
        found.append(node)
    return found


def stored_edges(edges, nodes):
    """A stored map's edges between `nodes`; an unknown or missing label
    reads as no label. An edge to a node dropped from `nodes`, a repeated
    id, or a repeated (source, target, label) link is skipped — first
    occurrence wins, so a legacy map reads back in a shape its own save
    would accept."""
    if not isinstance(edges, list):
        return []
    ids = {node["id"] for node in nodes}
    found, seen_ids, seen_links = [], set(), set()
    for raw in edges:
        edge = _edge(raw)
        if edge is None or edge["source"] == edge["target"]:
            continue
        if edge["source"] not in ids or edge["target"] not in ids:
            continue
        if edge["label"] not in LABELS:
            edge["label"] = ""
        if edge["id"] in seen_ids:
            continue
        link = (edge["source"], edge["target"], edge["label"])
        if link in seen_links:
            continue
        seen_ids.add(edge["id"])
        seen_links.add(link)
        found.append(edge)
    return found


def _refuse(field, message):
    raise ValidationError({field: [message]})


def clean_name(value):
    name = value.strip() if isinstance(value, str) else ""
    if not name:
        _refuse("name", NAME_NEEDED)
    if len(name) > MAX_NAME:
        _refuse("name", NAME_TOO_LONG)
    return name


def clean_nodes(value, *, viewer, customer_id=None, account_id=None, kept_contact_ids):
    """The nodes a save stores. `kept_contact_ids` are the people already on
    the stored map: they stay allowed although the saver may not open them or
    they were deleted. Anyone else must be one of the record's people that
    the saver may open."""
    if not isinstance(value, list):
        _refuse("nodes", BAD_NODE)
    if len(value) > MAX_NODES:
        _refuse("nodes", TOO_MANY_PEOPLE)
    nodes = [_node(raw) for raw in value]
    if any(node is None for node in nodes):
        _refuse("nodes", BAD_NODE)
    if len({node["id"] for node in nodes}) != len(nodes):
        _refuse("nodes", NODE_ID_TWICE)
    contact_ids = [node["data"]["contact_id"] for node in nodes]
    if len(set(contact_ids)) != len(contact_ids):
        _refuse("nodes", CONTACT_TWICE)
    added = set(contact_ids) - set(kept_contact_ids)
    if added:
        # SOC2:AUTH-02 a person is added only from the map's record, by someone who may open them
        allowed = (
            Contact.objects.filter(
                record_contacts_q(customer_id=customer_id, account_id=account_id)
            )
            .filter(visible_children_q(viewer))
            .filter(pk__in=added)
            .values_list("pk", flat=True)
        )
        if set(allowed) != added:
            _refuse("nodes", NOT_ON_RECORD)
    return nodes


def clean_edges(value, nodes):
    """The edges a save stores, between `nodes` (already cleaned)."""
    if not isinstance(value, list):
        _refuse("edges", BAD_EDGE)
    if len(value) > MAX_EDGES:
        _refuse("edges", TOO_MANY_LINES)
    ids = {node["id"] for node in nodes}
    edges, edge_ids, links = [], set(), set()
    for raw in value:
        edge = _edge(raw)
        if edge is None:
            _refuse("edges", BAD_EDGE)
        if edge["label"] not in LABELS:
            _refuse("edges", BAD_LABEL)
        ends = (edge["source"], edge["target"])
        if ends[0] == ends[1] or not set(ends) <= ids:
            _refuse("edges", EDGE_ENDS)
        if edge["id"] in edge_ids:
            _refuse("edges", EDGE_ID_TWICE)
        link = (*ends, edge["label"])
        if link in links:
            _refuse("edges", EDGE_TWICE)
        edge_ids.add(edge["id"])
        links.add(link)
        edges.append(edge)
    return edges


def layout(people):
    """`people` are (contact id, rank) in map order. Each rank starts a new
    row; a row holds six and the rest spill onto the next, left-aligned on a
    240 × 160 grid."""
    nodes, row, column, rank_now = [], -1, ROW_SIZE, None
    for contact_id, rank in people:
        if rank != rank_now or column == ROW_SIZE:
            row, column, rank_now = row + 1, 0, rank
        nodes.append(
            {
                "id": f"c{contact_id}",
                "position": {"x": column * GRID_X, "y": row * GRID_Y},
                "data": {"contact_id": contact_id},
            }
        )
        column += 1
    return nodes


def people_nodes(viewer, *, customer_id=None, account_id=None):
    """A new map's nodes: the record's people the creator may open, by role
    then name, at most 60 (spec §1.4)."""
    rank = Case(
        *(When(role__in=roles, then=Value(index)) for index, roles in enumerate(ROLE_ROWS)),
        default=Value(len(ROLE_ROWS)),
        output_field=IntegerField(),
    )
    # SOC2:AUTH-02 a new map holds only people its creator may open
    people = (
        Contact.objects.filter(record_contacts_q(customer_id=customer_id, account_id=account_id))
        .filter(visible_children_q(viewer))
        .annotate(rank=rank)
        .order_by("rank", "name", "pk")
        .values_list("pk", "rank")[:MAX_NODES]
    )
    return layout(list(people))
