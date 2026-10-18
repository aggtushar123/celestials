"""Which customer a colleague's Slack message names (Slack escalations D1,
SE1-7). Plain string work at sync time: no model reads the message (D2's
rule: no agent work at sync)."""

import re
from dataclasses import dataclass, field

from services.customers.models import Account, Customer

MIN_CHARS = 3
MAX_CANDIDATES = 5
_SUFFIX = re.compile(r"\s*\([^)]*\)\s*$")
_LEGAL = re.compile(r"[\s,]+(inc\.?|ltd\.?|llc)\s*$", re.IGNORECASE)


@dataclass(frozen=True)
class Name:
    folded: str
    type: str
    id: int
    label: str
    #: An account's parent customers (empty for a customer).
    parents: frozenset = frozenset()
    #: The folded name as a whole-word pattern, compiled once with the name
    #: (M1), never per message searched.
    pattern: re.Pattern = field(init=False, repr=False, compare=False)

    def __post_init__(self):
        object.__setattr__(self, "pattern", re.compile(rf"(?<!\w){re.escape(self.folded)}(?!\w)"))


def fold(name):
    """Lower case, without a trailing "(QA)"-style part or "Inc", "Ltd", "LLC"."""
    name = _SUFFIX.sub("", name or "")
    name = _LEGAL.sub("", name)
    return " ".join(name.lower().split())


def covered_names(connector):
    """The names of the records `connector` covers: the non-archived customers
    and the accounts it is linked to (with its customers' accounts), or every
    one in the workspace for a workspace-wide connection. Three queries, plus the one or two
    that tell whether the connection is workspace-wide."""
    organisation_id = connector.organisation_id
    customers = Customer.objects.filter(organisation_id=organisation_id, is_archived=False)
    accounts = Account.objects.filter(
        id__in=Account.objects.filter(customers__organisation_id=organisation_id).values("id")
    )
    if not connector.is_organisation_wide:
        linked = connector.customers.values("id")
        customers = customers.filter(id__in=linked)
        accounts = accounts.filter(id__in=connector.accounts.values("id")) | accounts.filter(
            id__in=Account.objects.filter(customers__in=linked).values("id")
        )
    names = [
        Name(fold(label), "customer", pk, label)
        for pk, label in customers.values_list("id", "name")
    ]
    parents = {}
    for account_id, customer_id in Account.customers.through.objects.filter(
        account_id__in=accounts.values("id")
    ).values_list("account_id", "customer_id"):
        parents.setdefault(account_id, set()).add(customer_id)
    names += [
        Name(fold(label), "account", pk, label, frozenset(parents.get(pk, ())))
        for pk, label in accounts.values_list("id", "name")
    ]
    return [n for n in names if len(n.folded) >= MIN_CHARS]


def find(text, names):
    """(the one record named, []) or (None, up to five candidates by name)."""
    folded = " ".join((text or "").lower().split())
    hits = [n for n in names if n.pattern.search(folded)]
    customers = {n.id for n in hits if n.type == "customer"}
    # An account named like its own matched customer is that customer (SE1-7).
    hits = [n for n in hits if not (n.type == "account" and n.parents & customers)]
    if len(hits) == 1:
        return hits[0], []
    return None, sorted(hits, key=lambda n: (n.label.lower(), n.id))[:MAX_CANDIDATES]
