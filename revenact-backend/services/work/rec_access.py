"""Who decides a recommendation, and which a reader is shown (Work round
§2.3, §4). `decided_as` is the decision routes' rule and `decidable` is the
same rule as a queryset, so the page offers exactly what the routes allow.
Both are always cut by the record rule (`openable`). `id IN` subqueries,
no DISTINCT (Postgres 16)."""

from django.db.models import Q

from services.accounts.capabilities import Capability
from services.accounts.hierarchy import subtree_ids
from services.customers.scoping import sees_everything, visible_accounts, visible_customers

from .models import Recommendation

ME, TEAM = "me", "team"
SCOPES = (ME, TEAM)
RECIPIENT, CHAIN, COMPANY = "recipient", "chain", "company"
#: What every read of a recommendation loads with it.
RELATED = (
    "customer",
    "account",
    "suggested_assignee",
    "recipient",
    "agent_action",
    "agent_action__customer",
    "agent_action__account",
    "decided_by",
)


def default_scope(reader):
    """Team for someone with reports or view_all_accounts, else Me."""
    return TEAM if sees_everything(reader) or subtree_ids(reader) else ME


def decided_as(reader, rec):
    """How `reader` may decide `rec`: "recipient", "chain" (above its
    suggested assignee), "company" (view_all_accounts), or None."""
    # SOC2:AUTH-02 its recipient, anyone above the person it suggests, or view_all_accounts
    role = None
    if rec.recipient_id == reader.pk:
        role = RECIPIENT
    elif rec.suggested_assignee_id is not None and rec.suggested_assignee_id in subtree_ids(reader):
        role = CHAIN
    elif sees_everything(reader):
        role = COMPANY
    if role is not None and not _may_change_owner(reader, rec):
        return None
    if role is not None and rec.agent_action_id is not None:
        from services.agents.source_access import may_read_source

        # SOC2:AUTH-02 a draft reply is decided only by a reader of its source
        if not may_read_source(reader, rec.agent_action):
            return None
    return role


def _owner_change(rec):
    from services.metrics.models import AgentAction

    action = rec.agent_action if rec.agent_action_id else None
    return action is not None and action.kind == AgentAction.Kind.RECORD_OWNER


def _may_change_owner(reader, rec):
    """An owner change is decided only by someone with the owner-change right
    (`knowledge.ownership.may_change_owner`), as its Apply route checks."""
    from services.knowledge.ownership import may_change_owner

    # SOC2:AUTH-02 an owner change needs the right a person's own PATCH of the owner needs
    return not _owner_change(rec) or may_change_owner(reader, rec.record)


def _owner_changes_out_of_reach(reader):
    """Recommendations of owner changes `reader` may not decide, as an
    `id IN` subquery (`may_change_owner` as a filter: the record is unowned,
    or its owner is the reader or below them; settings managers may change
    any). None when the reader may change every owner."""
    from services.metrics.models import AgentAction

    if reader.has_capability(Capability.MANAGE_ORG_SETTINGS):
        return None
    mine = {reader.pk, *subtree_ids(reader)}
    within = Recommendation.objects.filter(
        Q(account__isnull=True, customer__owner__isnull=True)
        | Q(account__isnull=True, customer__owner_id__in=mine)
        | Q(account__isnull=False, account__owner__isnull=True)
        | Q(account__isnull=False, account__owner_id__in=mine)
    ).values("id")
    owner_changes = AgentAction.objects.filter(kind=AgentAction.Kind.RECORD_OWNER).values("id")
    return Recommendation.objects.filter(agent_action_id__in=owner_changes).exclude(id__in=within)


def decidable(reader, scope):
    """The open recommendations in the reader's workspace that `scope` puts
    in front of them: Me is their queue; Team is all they may decide."""
    rows = Recommendation.objects.filter(
        organisation_id=reader.organisation_id, status=Recommendation.Status.OPEN
    )
    out_of_reach = _owner_changes_out_of_reach(reader)
    if out_of_reach is not None:
        # SOC2:AUTH-02 an owner change the reader can't make is not theirs to decide
        rows = rows.exclude(id__in=out_of_reach.values("id"))
    if scope == ME:
        return rows.filter(recipient_id=reader.pk)
    if sees_everything(reader):
        return rows
    below = sorted(subtree_ids(reader))
    return rows.filter(Q(recipient_id=reader.pk) | Q(suggested_assignee_id__in=below))


def openable(reader, rows):
    """`rows` cut to recommendations about records `reader` may open, and
    for a draft reply, whose source they may read."""
    from services.agents.source_access import unreadable_draft_ids

    # SOC2:AUTH-02 the record rule: an organisation's own, or an account's own
    rows = rows.filter(
        Q(account__isnull=True, customer_id__in=visible_customers(reader).values("id"))
        | Q(account__isnull=False, account_id__in=visible_accounts(reader).values("id"))
    )
    # SOC2:AUTH-02 a draft reply's recommendation only for its source's readers
    return rows.exclude(agent_action_id__in=unreadable_draft_ids(reader))
