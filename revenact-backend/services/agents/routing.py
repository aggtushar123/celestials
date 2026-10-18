"""Where a thread's bundle goes, and which agent reads it (agent bundles D2,
contract D2-4, D2-5, D2-10). Privacy decides the route: a bundle goes only
to people who may read its source (§5.1)."""

from dataclasses import dataclass

from django.db.models import Q

from services.accounts.models import User
from services.customers.models import Account, Opportunity
from services.work.standing import is_working

from .models import AgentBundle, SignalThread
from .threads import may_read_source

R = AgentBundle.RoutedTo
NO_READER = "no_reader"


@dataclass(frozen=True)
class Route:
    routed_to: str
    #: Who it goes to when `routed_to` is owner: the mailbox owner for mail,
    #: else the record's owner; None otherwise.
    user: object = None
    #: The User.Function code when `routed_to` is department, else "".
    department: str = ""

    @property
    def queue(self):
        """The Work queue it waits in (contract §4.5)."""
        if self.routed_to == R.DEPARTMENT:
            return f"department:{self.department}"
        if self.routed_to == R.ADMINS:
            return "unassigned"
        return "mine"


def route(thread):
    """(Route, None), or (None, a skip reason) for a thread nobody may read."""
    record = thread.record
    if record is None:
        return None, NO_READER
    if thread.source_kind == SignalThread.SourceKind.MAIL:
        # SOC2:AUTH-02 mail is its mailbox owner's alone (2026-10-17): the bundle
        # goes to them, never to the record owner, a department or an admin (D2-4),
        # and only when they may open its record, or nobody could read the bundle
        from services.customers.scoping import can_open

        mailbox_owner = thread.mailbox_owner
        if (
            mailbox_owner is not None
            and is_working(mailbox_owner, thread.organisation)
            and can_open(mailbox_owner, record)
        ):
            return Route(R.OWNER, mailbox_owner), None
        return None, NO_READER
    owner = record.owner
    if (
        owner is not None
        and is_working(owner, thread.organisation)
        and may_read_source(owner, thread)
    ):
        return Route(R.OWNER, owner), None
    if thread.department:
        return Route(R.DEPARTMENT, department=thread.department), None
    return Route(R.ADMINS), None


def choose_agent(thread):
    """D2-10: a ticket to CS; mail to Sales on a record with an open deal or a
    Sales owner, else to CS. No D2 thread goes to Ops (D2-2)."""
    if thread.source_kind != SignalThread.SourceKind.MAIL:
        return "cs"
    record = thread.record
    on = Q(account=record) if isinstance(record, Account) else Q(customer=record)
    open_deal = Opportunity.objects.filter(on, stage__in=Opportunity.OPEN_STAGES).exists()
    owner = record.owner
    if open_deal or (owner is not None and owner.function == User.Function.SALES):
        return "sales"
    return "cs"
