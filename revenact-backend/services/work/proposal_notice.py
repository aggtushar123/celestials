"""The once-a-day "Bundles waiting" notice (Work in one place, delivery 2
contract §4.1; Agent bundles contract §10.6). This tells the people who could
run a new agent bundle on their own Mine, at most once a day each.

Visibility is the feed's own: a person is told only of bundles on their Mine
(`feed_decide.Bundles(user).readable`: a waiting step on their Me desk, then
the bundle read rule) one of whose steps they may decide
(`agents.deciding.may_decide`). The queries grow with the people who might be
told, never with the bundles."""

from django.utils import timezone

from services.accounts.models import User
from services.agents.deciding import WAIT, may_decide
from services.agents.models import AgentBundle
from services.copilot.models import SessionParticipant
from services.metrics.models import AgentAction
from services.notifications.models import Notification

from .clock import start_of_day
from .feed_decide import Bundles
from .standing import working_ids

KIND = Notification.Kind.AGENT_PROPOSAL_WAITING
PROPOSALS_LINK = "/work?queue=mine&kind=bundle"
MESSAGE = "Bundles are waiting for your decision."


def candidates(organisation, since):
    """Everyone a bundle made after `since` could sit on the Mine of: its
    record's owner, and its steps' sessions' owners and present participants.
    A superset: `notify_proposals` applies the exact rule to each."""
    bundles = AgentBundle.objects.filter(
        organisation=organisation, status=AgentBundle.Status.WAITING, created_at__gt=since
    )
    proposed = AgentAction.objects.filter(
        bundle_id__in=bundles.values("id"), status=AgentAction.Status.PROPOSED
    )
    people = set()
    for owners in proposed.values_list(
        "customer__owner_id", "account__owner_id", "session__conversation__user_id"
    ):
        people.update(pk for pk in owners if pk)
    sessions = proposed.filter(session__isnull=False).values("session_id")
    people.update(
        SessionParticipant.objects.filter(
            session_id__in=sessions, left_at__isnull=True
        ).values_list("user_id", flat=True)
    )
    return people


def _last_told(user):
    return (
        Notification.objects.filter(recipient=user, kind=KIND)
        .order_by("-created_at")
        .values_list("created_at", flat=True)
        .first()
    )


def _decides_one(user, actions):
    """Whether `user` may decide any of `actions` (the waiting steps of the
    bundles they were offered). `may_decide` answers alike for actions of one
    kind on records of one owner (a readable draft's source is readable) and
    of one routing, so it is asked once per (kind, owner, routing), not per
    row: a participant who may decide none of a session's many proposals costs
    no more than one. The routing is in the key because on a record nobody
    owns the answer is the bundle's queue (D2-6), not the kind and owner. A
    bundle `user` took part in the Slack thread of (SE4-25) answers on its
    own, so it is its own key (read in the same query as `actions`)."""
    from django.db.models import Exists, OuterRef

    from services.agents.models import BundleParticipant

    actions = actions.annotate(
        took_part=Exists(
            BundleParticipant.objects.filter(user=user, bundle_id=OuterRef("bundle_id"))
        )
    )
    asked = set()
    for action in actions:
        record = action.record
        bundle = action.bundle
        key = (
            action.kind,
            record is None,
            None if record is None else record.owner_id,
            None if bundle is None else (bundle.routed_to, bundle.department),
            action.bundle_id if action.took_part else None,
        )
        if key in asked:
            continue
        asked.add(key)
        if may_decide(user, action):
            return True
    return False


def notify_proposals(organisation, *, today, now=None, actor=None):
    """Tell each person with a new bundle they may run on their own Mine,
    once per workspace day. Returns how many were told."""
    from services.notifications.realtime import notify

    now = now or timezone.now()
    floor = now - WAIT
    people = candidates(organisation, floor)
    if not people:
        return 0
    # SOC2:AUTH-02 a suspended or revoked member is not told of work
    people &= working_ids(organisation)
    if actor is not None:
        people.discard(actor.pk)
    day = start_of_day(organisation, today)
    told = 0
    for user in User.objects.filter(pk__in=sorted(people)).order_by("pk"):
        last = _last_told(user)
        if last is not None and last >= day:
            continue
        since = floor if last is None else max(floor, last)
        # SOC2:AUTH-02 the feed's own rule: only bundles on the person's Mine
        # (the bundle read rule), and only if they may run one of their steps
        bundles = Bundles(user).readable.filter(created_at__gt=since)
        waiting = (
            AgentAction.objects.filter(
                bundle_id__in=bundles.values("id"), status=AgentAction.Status.PROPOSED
            )
            .select_related("customer__owner", "account__owner", "organisation", "bundle")
            .order_by("created_at", "id")
        )
        if not _decides_one(user, waiting):
            continue
        notify(
            recipient=user,
            actor=None,
            kind=KIND,
            message=MESSAGE,
            link=PROPOSALS_LINK,
            push_on_commit=True,
        )
        told += 1
    return told


QUEUE_LINK = "/work?queue={key}&kind=bundle"


def queue_candidates(organisation, keys):
    """Everyone who may use one of `keys` (D2-24): a department's people and
    Leadership; admins for Unassigned. A superset: `notify_queues` applies
    the exact rule to each."""
    from django.db.models import Q

    from services.accounts.capabilities import Capability

    from .queue_bundles import UNASSIGNED, code_of

    users = User.objects.filter(organisation=organisation, is_active=True)
    codes = sorted({code_of(key) for key in keys if key != UNASSIGNED})
    people = set()
    if codes:
        people |= set(
            users.filter(Q(function__in=codes) | Q(function=User.Function.LEADERSHIP)).values_list(
                "pk", flat=True
            )
        )
    if UNASSIGNED in keys:
        people |= {user.pk for user in users if user.has_capability(Capability.MANAGE_ORG_SETTINGS)}
    return people


def notify_queues(organisation, bundle_ids, *, today, now=None):
    """Tell each person who may read and run a step of a new department or
    Unassigned bundle, once per workspace day (contract D2-24)."""
    from services.notifications.realtime import notify

    from .queue_bundles import QueueBundles, may_use, queue_key

    fresh = AgentBundle.objects.filter(
        organisation=organisation,
        pk__in=sorted(bundle_ids),
        status=AgentBundle.Status.WAITING,
        source=AgentBundle.Source.THREAD,
        routed_to__in=(AgentBundle.RoutedTo.DEPARTMENT, AgentBundle.RoutedTo.ADMINS),
    ).only("routed_to", "department")
    keys = sorted({queue_key(bundle) for bundle in fresh})
    if not keys:
        return 0
    # SOC2:AUTH-02 a suspended or revoked member is not told of work
    people = queue_candidates(organisation, keys) & working_ids(organisation)
    day = start_of_day(organisation, today)
    told = 0
    for user in User.objects.filter(pk__in=sorted(people)).order_by("pk"):
        last = _last_told(user)
        if last is not None and last >= day:
            continue
        for key in keys:
            if not may_use(user, key):
                continue
            # SOC2:AUTH-02 the queue's own read rule, and only if they may run one of its steps
            bundles = QueueBundles(user, key).readable.filter(pk__in=sorted(bundle_ids))
            waiting = (
                AgentAction.objects.filter(
                    bundle_id__in=bundles.values("id"), status=AgentAction.Status.PROPOSED
                )
                .select_related("customer__owner", "account__owner", "organisation", "bundle")
                .order_by("created_at", "id")
            )
            if not _decides_one(user, waiting):
                continue
            notify(
                recipient=user,
                actor=None,
                kind=KIND,
                message=MESSAGE,
                link=QUEUE_LINK.format(key=key),
                push_on_commit=True,
            )
            told += 1
            break
    return told
