"""The desk: for each kind of waiting item, everything waiting on the
scope's people (`waiting`) and the part of it the reader may open
(`readable`). `waiting` minus `readable` is the page's `hidden` count.

Whose desk: Me is the reader, My team is the reader and everyone below
them (the scope's `owner_ids`), and Company is everyone (`owner_ids` is
None). Inside it, every item is filtered by the reader's own rights,
never the scope's, because the reader is the one shown it.

One `id IN (subquery)` per way in, never a join de-duplicated with
DISTINCT: Postgres 16 plans that badly (services.customers.scoping).
A test checks every query here for DISTINCT."""

from dataclasses import dataclass

from django.db.models import Q

from .scope import ME

KINDS = ("rule_review", "agent_action", "question", "overdue_task")


@dataclass(frozen=True)
class Source:
    kind: str
    waiting: object
    readable: object


def _owners(scope):
    """The desk's people, or None for Company (everyone)."""
    return None if scope.is_company else sorted(scope.owner_ids)


def rule_reviews(reader, scope):
    from services.rules.access import readable_rules
    from services.rules.models import RuleReview

    waiting = RuleReview.objects.filter(
        status=RuleReview.Status.WAITING, rule__organisation_id=reader.organisation_id
    )
    owners = _owners(scope)
    if owners is not None:
        waiting = waiting.filter(rule__owner_id__in=owners)
    # SOC2:AUTH-02 a review is shown only on a rule the reader may read
    readable = waiting.filter(rule_id__in=readable_rules(reader).values("id"))
    return Source("rule_review", waiting, readable)


def session_ids_seen_whole(reader):
    """The sessions with a waiting agent action whose whole conversation
    `reader` sees: the owner, or a present participant whose accepted invite
    chains back to the owner (copilot.views.sees_whole_conversation)."""
    from services.agents.deciding import proposed
    from services.copilot.models import CopilotSession, SessionParticipant
    from services.copilot.views import sees_whole_conversation
    from services.metrics.models import AgentAction

    # Only sessions the reader owns or is present in can pass the per-session
    # check below, so the rest are ruled out in SQL first: the badge runs on
    # every page, and its cost must not grow with the organisation's sessions.
    present = SessionParticipant.objects.filter(user=reader, left_at__isnull=True).values(
        "session_id"
    )
    sessions = (
        CopilotSession.objects.filter(
            id__in=proposed(
                AgentAction.objects.filter(
                    organisation_id=reader.organisation_id, session__isnull=False
                )
            ).values("session_id")
        )
        .filter(Q(conversation__user_id=reader.id) | Q(id__in=present))
        .select_related("conversation")
    )
    return frozenset(s.id for s in sessions if sees_whole_conversation(s.conversation, reader))


def agent_actions(reader, scope, sessions):
    """Agent actions wait on their record's owner; workspace-level ones on
    Company, for view_all readers only (never counted as hidden for anyone
    else). In Me, so do the facilitator's from a session the reader took
    part in (`sessions`), whatever they name."""
    from services.agents.bundles import others_personal_bundle_ids, own_meeting_bundle_ids
    from services.agents.deciding import proposed
    from services.agents.models import PERSONAL_SOURCES, AgentBundle
    from services.agents.registry import REGISTRY
    from services.agents.views import readable as readable_actions
    from services.customers.models import Account, Customer
    from services.customers.scoping import sees_everything
    from services.metrics.models import AgentAction

    # One past its wait can no longer be applied, so nothing waits on it.
    base = proposed(AgentAction.objects.filter(organisation_id=reader.organisation_id))
    # SOC2:AUTH-02 a Slack message's (a meeting's) bundle waits on its sender (organiser) alone: off
    # everyone else's desk (the record's owner's too), so never counted as hidden
    base = base.exclude(bundle_id__in=others_personal_bundle_ids(reader))
    if not sees_everything(reader):
        # SOC2:AUTH-02 a workspace-level action is view-all's alone: off
        # everyone else's desk, so never counted as hidden (contract)
        workspace = [key for key, spec in REGISTRY.items() if spec.workspace_level]
        # A meeting bundle's step (sales review report) is its organiser's own.
        base = base.exclude(
            Q(kind__in=workspace) & ~Q(bundle_id__in=own_meeting_bundle_ids(reader))
        )
    owners = _owners(scope)
    if owners is None:
        waiting = base
    else:
        owned_customers = Customer.objects.filter(
            organisation_id=reader.organisation_id, owner_id__in=owners
        ).values("id")
        # Account has no organisation of its own: cut to the workspace through
        # its organisations.
        workspace_accounts = Account.customers.through.objects.filter(
            customer__organisation_id=reader.organisation_id
        ).values("account_id")
        owned_accounts = Account.objects.filter(
            owner_id__in=owners, id__in=workspace_accounts
        ).values("id")
        on_desk = Q(customer_id__in=owned_customers) | Q(account_id__in=owned_accounts)
        if scope.key == ME and sessions:
            on_desk |= Q(session_id__in=sorted(sessions))
        if scope.key == ME:
            # Personal bundles (a Slack message's, a meeting's): the reader's own,
            # whoever owns the record.
            on_desk |= Q(
                bundle_id__in=AgentBundle.objects.filter(
                    organisation_id=reader.organisation_id,
                    source__in=PERSONAL_SOURCES,
                    routed_user_id=reader.pk,
                ).values("id")
            )
        waiting = base.filter(on_desk)
    # SOC2:AUTH-02 an action is shown only on a record the reader may open;
    # workspace-level ones only to view_all readers (Decision 11)
    return Source("agent_action", waiting, readable_actions(reader, waiting))


def questions(reader, scope):
    from services.accounts.hierarchy import scope_ids, subtree_ids
    from services.customers.models import Customer
    from services.customers.scoping import visible_customers
    from services.knowledge.models import FunctionOwner, Question

    waiting = Question.objects.filter(
        organisation_id=reader.organisation_id, status=Question.Status.OPEN
    )
    owners = _owners(scope)
    if owners is not None:
        waiting = waiting.filter(assignee_id__in=owners)
    responsible = Customer.objects.filter(
        organisation_id=reader.organisation_id, owner_id=reader.id
    ).values("id")
    # SOC2:AUTH-02 knowledge.views.visible_questions' rule as id-IN filters,
    # and the customer it names must be one the reader may open
    readable = waiting.filter(
        Q(asked_by_id__in=sorted(scope_ids(reader)))
        | Q(assignee_id__in=sorted({reader.id, *subtree_ids(reader)}))
        | Q(customer_id__in=responsible)
        | Q(customer_id__in=FunctionOwner.objects.filter(user_id=reader.id).values("customer_id"))
    ).filter(
        Q(customer_id__isnull=True) | Q(customer_id__in=visible_customers(reader).values("id"))
    )
    return Source("question", waiting, readable)


def overdue_tasks(reader, scope, today):
    from services.customers.models import Task
    from services.customers.personal import visible_tasks
    from services.customers.scoping import visible_accounts, visible_customers
    from services.customers.task_access import on_record_q

    # SOC2:AUTH-02 a to-do is its creator's alone: never on a desk, not even as hidden
    waiting = (
        Task.objects.filter(assignee__organisation_id=reader.organisation_id, due_date__lt=today)
        .filter(on_record_q())
        .exclude(status=Task.Status.COMPLETED)
    )
    owners = _owners(scope)
    if owners is not None:
        waiting = waiting.filter(assignee_id__in=owners)
    # SOC2:AUTH-02 a task is read by its chain rule, on a record the reader may open
    readable = visible_tasks(reader, waiting).filter(
        Q(customer_id__in=visible_customers(reader).values("id"))
        | Q(account_id__in=visible_accounts(reader).values("id"))
    )
    return Source("overdue_task", waiting, readable)


def sources(reader, scope, today, sessions):
    """The four sources in `KINDS` order. `sessions` is
    `session_ids_seen_whole(reader)`; it widens only the Me desk."""
    return [
        rule_reviews(reader, scope),
        agent_actions(reader, scope, sessions),
        questions(reader, scope),
        overdue_tasks(reader, scope, today),
    ]
