"""A record's people, counted by role (contract, canvas.create): an
organisation's own contacts and its accounts', an account's own, as a map
built from people lays them out (`customers.canvas.record_contacts_q`).
Counted, never named; two queries for any number of records."""

from collections import Counter

from django.db.models import Count, Q

from services.customers.canvas import ROLE_ROWS
from services.customers.models import Account, Contact
from services.customers.scoping import visible_children_q

#: The line's role order: a map's rows first, then every other role.
ORDER = [role for row in ROLE_ROWS for role in row]
ORDER += [role for role in Contact.Role.values if role not in ORDER]
LABELS = dict(Contact.Role.choices)


def record_people(contacts, customer_ids, account_ids):
    """`{ref: Counter(role -> n)}` among `contacts` (a Contact queryset)
    for each record that has any."""
    customer_ids, account_ids = set(customer_ids), set(account_ids)
    parents = {}
    if customer_ids:
        links = Account.customers.through.objects.filter(
            customer_id__in=sorted(customer_ids)
        ).values_list("customer_id", "account_id")
        for customer_id, account_id in links:
            parents.setdefault(account_id, set()).add(customer_id)
    wanted = account_ids | set(parents)
    rows = (
        contacts.filter(Q(customer_id__in=sorted(customer_ids)) | Q(account_id__in=sorted(wanted)))
        .order_by()
        .values("customer_id", "account_id", "role")
        .annotate(n=Count("id"))
    )
    found = {}
    for row in rows:
        refs = set()
        if row["customer_id"] in customer_ids:
            refs.add(f"customer:{row['customer_id']}")
        account_id = row["account_id"]
        if account_id is not None:
            if account_id in account_ids:
                refs.add(f"account:{account_id}")
            refs |= {f"customer:{pk}" for pk in parents.get(account_id, ())}
        for ref in refs:
            found.setdefault(ref, Counter())[row["role"]] += row["n"]
    return found


def people_line(counts):
    """`people: 6 (decision maker 1, champion 2, other 3)`, or None."""
    total = sum(counts.values())
    if not total:
        return None
    parts = [f"{LABELS[role].lower()} {counts[role]}" for role in ORDER if counts.get(role)]
    return f"people: {total} ({', '.join(parts)})"


def ref_of(action):
    if action.account_id is not None:
        return f"account:{action.account_id}"
    return f"customer:{action.customer_id}"


def visible_people(reader, refs):
    """`{ref: how many of the record's people reader may open}`."""
    ids = {"customer": set(), "account": set()}
    for ref in refs:
        kind, _, pk = ref.partition(":")
        ids[kind].add(int(pk))
    # SOC2:AUTH-02 counted over the people the reader may open, never named
    seen = Contact.objects.filter(visible_children_q(reader))
    found = record_people(seen, ids["customer"], ids["account"])
    return {ref: sum(found.get(ref, {}).values()) for ref in refs}
