"""The department and Unassigned queues (agent bundles D2, contract §4.5,
§4.6, D2-5 to D2-9): message bundles routed to a department, or to admins,
for the people who may use each queue, read by the bundle read rule. They
hold only bundles: no overdue tasks, no suggestions, no kind chips."""

from services.accounts.capabilities import Capability
from services.accounts.models import User
from services.brain.scope import ScopeNotAllowed, ScopeUnknown
from services.customers.personal import reads_every_ticket_department

from . import feed_decide
from .feed_shape import BUNDLE, DECIDE, PAGE, SUGGESTED, decode, group
from .feed_team_decide import bundle_rows

UNASSIGNED = "unassigned"
DEPARTMENT = "department:"
LABELS = dict(User.Function.choices)
OVERDUE = "overdue"


class QueueUnknown(ScopeUnknown):
    detail = "Choose team, company, a department or unassigned."


def is_queue_key(key):
    return key == UNASSIGNED or str(key or "").startswith(DEPARTMENT)


def code_of(key):
    return key[len(DEPARTMENT) :]


def label(key):
    return "Unassigned" if key == UNASSIGNED else LABELS[code_of(key)]


def queue_key(bundle):
    from services.agents.models import AgentBundle

    if bundle.routed_to == AgentBundle.RoutedTo.ADMINS:
        return UNASSIGNED
    return f"{DEPARTMENT}{bundle.department}"


def may_use(reader, key):
    """D2-7's people rule: a department's own people and Leadership; admins
    for Unassigned."""
    if key == UNASSIGNED:
        return reader.has_capability(Capability.MANAGE_ORG_SETTINGS)
    code = code_of(key)
    return code in LABELS and (reader.function == code or reads_every_ticket_department(reader))


def resolve(reader, key):
    if key != UNASSIGNED and code_of(key) not in LABELS:
        raise QueueUnknown(key)
    # SOC2:AUTH-02 a queue the reader may not use is refused before anything is read
    if not may_use(reader, key):
        raise ScopeNotAllowed(key)
    return key


def listed(reader):
    """The queues the rail offers (D2-7): a department's while an enabled
    ticket connector belongs to it; Unassigned while one belongs to none."""
    from services.agents.threads import TICKET_SOURCES
    from services.connectors.models import Connector

    departments = set(
        Connector.objects.filter(
            organisation_id=reader.organisation_id, is_enabled=True, provider__in=TICKET_SOURCES
        ).values_list("department", flat=True)
    )
    keys = [f"{DEPARTMENT}{code}" for code in LABELS if code in departments]
    if "" in departments:
        keys.append(UNASSIGNED)
    return [key for key in keys if may_use(reader, key)]


class QueueBundles(feed_decide.Source):
    """A queue's waiting bundles (inside their 14 days); `hidden` is what the
    bundle read rule removes (contract §4.6)."""

    kind, rank = BUNDLE, 1
    related = ("customer__owner", "account__owner", "thread")

    def __init__(self, reader, key):
        from services.agents.bundles import live_waiting, readable
        from services.agents.models import AgentBundle

        self.reader = reader
        rows = AgentBundle.objects.filter(
            organisation_id=reader.organisation_id, source=AgentBundle.Source.THREAD
        )
        if key == UNASSIGNED:
            rows = rows.filter(routed_to=AgentBundle.RoutedTo.ADMINS)
        else:
            rows = rows.filter(routed_to=AgentBundle.RoutedTo.DEPARTMENT, department=code_of(key))
        self.waiting = live_waiting(rows)
        # SOC2:AUTH-02 the bundle read rule (record openable, the thread's source readable)
        self.readable = readable(reader, self.waiting)

    def items(self, bundles):
        return bundle_rows(bundles, self.reader)


def _read(reader, key, after):
    source = QueueBundles(reader, key)
    return source.count(), source.hidden(), source.page(after, PAGE + 1)


def build(reader, key):
    from .feed import attempt, ordered

    failed = []
    got = attempt([BUNDLE], failed, lambda: _read(reader, key, None))
    decide = group(DECIDE, 0, []) if got is None else group(DECIDE, got[0], got[2])
    return {
        "scope": key,
        "groups": [decide, group(OVERDUE, 0, []), group(SUGGESTED, 0, [])],
        "hidden": 0 if got is None else got[1],
        "failed": ordered(failed),
    }


def page(reader, key, *, group_key, cursor):
    from .feed import attempt, ordered

    if group_key != DECIDE:
        return {"scope": key, "group": group(group_key, 0, []), "failed": []}
    after = None if cursor is None else decode(DECIDE, cursor)
    failed = []
    got = attempt([BUNDLE], failed, lambda: _read(reader, key, after))
    payload = group(DECIDE, 0, []) if got is None else group(DECIDE, got[0], got[2])
    return {"scope": key, "group": payload, "failed": ordered(failed)}


def count(reader, key):
    return QueueBundles(reader, key).count()
