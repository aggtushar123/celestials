"""A Brain scope's book as filters (spec: react-ts-app docs/superpowers/
specs/2026-10-05-brain-customers-design.md §1.2).

Me is the reader's customers, and the accounts they own or that sit under
those customers; My team the same for the reader and everyone below them;
Company the whole organisation, which needs no filter (None). It is the
book `ScopeActor` reads (a test checks they match), written out as
`id IN (subquery)` filters, never a join made unique with DISTINCT
(Postgres 16, services.customers.scoping). So a list can be narrowed to a
scope while everything in it is still named by the reader's own rights."""

from django.db.models import Q

from services.customers.models import Account, Customer


def _whole(scope):
    return scope is None or scope.is_company


def customers(scope):
    """The book's customer ids as a subquery, or None for the whole organisation."""
    if _whole(scope):
        return None
    return Customer.objects.filter(
        organisation_id=scope.user.organisation_id, owner_id__in=sorted(scope.owner_ids)
    ).values("id")


def accounts(scope):
    """The book's account ids as a subquery, or None for the whole organisation."""
    if _whole(scope):
        return None
    links = Account.customers.through.objects
    # An account belongs to an organisation through its customers.
    ours = links.filter(customer__organisation_id=scope.user.organisation_id).values("account_id")
    under = links.filter(customer_id__in=customers(scope)).values("account_id")
    return (
        Account.objects.filter(id__in=ours)
        .filter(Q(owner_id__in=sorted(scope.owner_ids)) | Q(id__in=under))
        .values("id")
    )


def q(scope, *, customer="customer_id", account="account_id"):
    """Rows on the book's customers or accounts, for any model that hangs
    off one of them; None for the whole organisation."""
    if _whole(scope):
        return None
    return Q(**{f"{customer}__in": customers(scope)}) | Q(**{f"{account}__in": accounts(scope)})
