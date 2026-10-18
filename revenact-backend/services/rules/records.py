"""The records a rule acts on (organisations, accounts or contacts), always
read through someone's visibility.

Visibility is an `id__in` subquery over `visible_records`, never a
`.distinct()` over the visibility joins on the outer query, which Postgres
16 plans badly over a large book."""

from django.db.models import Q

from services.customers.models import Contact
from services.customers.scoping import visible_accounts, visible_children_q, visible_customers
from services.segments.evaluate import MODELS, visible_records

#: What a night's actions read from each kind, joined in the one query that loads them.
RELATED = {
    "customer": ("owner",),
    "account": ("owner",),
    "contact": ("customer__owner", "account__owner"),
}


def openable(kind, viewer, ids):
    """The records among `ids` (a list, or a subquery of ids) that `viewer` may open."""
    # SOC2:AUTH-02 a rule matches, acts on, names or counts only records its viewer may open
    visible = visible_records(kind, viewer).values("pk")
    return MODELS[kind].objects.filter(pk__in=ids).filter(pk__in=visible).order_by()


def load(kind, ids):
    """The records with what the actions read, in id order."""
    rows = MODELS[kind].objects.filter(pk__in=list(ids)).select_related(*RELATED[kind])
    return list(rows.order_by("pk"))


def visible_q(viewer):
    """For rows that point at a record by `record_kind` and `record_id` (a
    night's records): those whose record `viewer` may open now."""
    contacts = Contact.objects.filter(visible_children_q(viewer)).values("pk")
    # SOC2:AUTH-02 a night's record is shown only to someone who may open it today
    return (
        Q(record_kind="customer", record_id__in=visible_customers(viewer).values("pk"))
        | Q(record_kind="account", record_id__in=visible_accounts(viewer).values("pk"))
        | Q(record_kind="contact", record_id__in=contacts)
    )


def names(kind, ids):
    """`{id: name}` for `ids`, in one query; none for no ids."""
    if not ids:
        return {}
    return dict(MODELS[kind].objects.filter(pk__in=list(ids)).values_list("pk", "name"))
