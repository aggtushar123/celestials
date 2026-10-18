"""The Team queue's scope (Work in one place, delivery 2 contract §1.1):
My team or Company, by Brain's rule (`brain.scope.available`): My team
needs reports, Company needs view_all_accounts or Leadership. Me is not a
Team scope: the reader's own desk is My work (Decision D2).

`people` is the scope's members other than `near`: everything already on
the reader's own My work stays off the queue (Decision D1), and Rest of
company leaves out the reader's own team too (Agent bundles D7)."""

from django.db.models import Q

from services.accounts.hierarchy import subtree_ids
from services.accounts.models import User
from services.brain.scope import COMPANY, TEAM, ScopeNotAllowed, ScopeUnknown, available, resolve

TEAM_SCOPES = (TEAM, COMPANY)


class TeamScopeUnknown(ScopeUnknown):
    detail = "Choose team or company."


def resolve_team(reader, key):
    """The reader's Team scope for `key` (None: the widest they have)."""
    # SOC2:AUTH-02 a scope the reader may not use is refused before anything is read
    if key is None:
        offered = [scope for scope in available(reader) if scope in TEAM_SCOPES]
        if not offered:
            raise ScopeNotAllowed(key)
        key = offered[-1]
    if key not in TEAM_SCOPES:
        raise TeamScopeUnknown(key)
    return resolve(reader, key)


def near(reader, scope):
    """Who is left out of a Team scope: the reader for My team; the reader and
    everyone below them for Rest of company (Agent bundles D7)."""
    if scope.is_company:
        return sorted({reader.pk, *subtree_ids(reader)})
    return [reader.pk]


def people(reader, scope):
    """The scope's members other than `near`, as an `id IN` subquery."""
    rows = User.objects.filter(organisation_id=reader.organisation_id).exclude(
        pk__in=near(reader, scope)
    )
    if not scope.is_company:
        rows = rows.filter(id__in=sorted(scope.owner_ids))
    return rows.values("id")


def owned_by_q(organisation_id, ids):
    """Rows (with customer/account FKs) on records owned by `ids`, as `id IN` subqueries."""
    from services.customers.models import Account, Customer

    customers = Customer.objects.filter(organisation_id=organisation_id, owner_id__in=ids).values(
        "id"
    )
    # No workspace cut needed: `ids` are the reader's workspace's people, and
    # the rows this filters are already cut to the reader's workspace.
    accounts = Account.objects.filter(owner_id__in=ids).values("id")
    return Q(customer_id__in=customers) | Q(account_id__in=accounts)


def named(user):
    """`{"id", "name"}`, or None for nobody (the row's `for`)."""
    return None if user is None else {"id": user.pk, "name": user.name}
