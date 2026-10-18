"""Who a recommendation is for (Work round §2.2 Routing).

**Suggested assignee.** The person whose job it is: the organisation's CS
function owner (knowledge.FunctionOwner) for renewals, health drops,
tickets and anomalies; the record owner (the account's for an account's
signal, else the organisation's) after that; for an agent's task.create,
the member it names (metrics.proposals.match_member), then the
organisation's owner.

**Recipient.** In manager mode, the suggested person's manager; otherwise,
or without a manager who qualifies, the suggested person. With nobody
suggested: the first active member with view_all_accounts, else the
workspace's owner.

**Everyone qualifies the same way:** active for work (`standing`: an
active user with an active membership here), and able to open the record
(scoping.can_open). A candidate who does not is passed over. `None` means
nobody can receive it; the caller counts it and tries again next run.

**A draft reply** (owner decision 2) also needs a reader of its source
(`agents.source_access`): its manager only if they read it too, and no
view-all or owner fallback, since a fallback is not chosen for reading it."""

from dataclasses import dataclass

from services.accounts.capabilities import Capability
from services.accounts.models import User
from services.agents.source_access import may_read_source, unreadable_draft_ids
from services.customers.scoping import can_open, visible_accounts, visible_customers

from .models import Recommendation, WorkSettings
from .standing import working_ids

K = Recommendation.Kind
DRAFT_REPLY = "draft.reply"
PROPOSED = "proposed"
CS = User.Function.CS

#: The function whose owner a kind is suggested to first; absent means the
#: proposal's person (agent).
FUNCTION_FOR = {
    K.RENEWAL_DUE: CS,
    K.HEALTH_DROP: CS,
    K.URGENT_TICKETS: CS,
    K.ANOMALY: CS,
}


@dataclass(frozen=True)
class Route:
    suggested: object
    recipient: object


class Router:
    """Routes one refresh's signals for one workspace. Its cost is fixed per
    person, never per record: the workspace's members (and so everyone's
    manager) are read once and each is one canonical instance; what a
    candidate can open is read once per candidate over the whole book
    (`for_book`), one `visible_customers` and one `visible_accounts` query
    each; function owners and the fallbacks are read once."""

    def __init__(self, organisation, recommend_to, *, customer_ids=None, account_ids=None):
        self.organisation = organisation
        self.recommend_to = recommend_to
        #: The records this refresh may route; None reads a candidate's whole
        #: visible set instead. A record outside them is asked on its own.
        self._ids = {"Customer": customer_ids, "Account": account_ids}
        self._people = None
        self._visible = {}
        self._unlisted = {}
        self._named = {}
        self._function_owners = None
        self._fallbacks = None
        self._working = None
        self._unreadable = {}

    @classmethod
    def for_book(cls, book, recommend_to):
        """A router for one refresh's book (`sources.load_book`)."""
        return cls(
            book.organisation,
            recommend_to,
            customer_ids=frozenset(book.customers),
            account_ids=frozenset(book.accounts),
        )

    def people(self):
        """The workspace's members by pk, read once (join order kept)."""
        if self._people is None:
            members = (
                User.objects.filter(organisation=self.organisation)
                .select_related("organisation", "role")
                .order_by("date_joined", "id")
            )
            self._people = {member.pk: member for member in members}
        return self._people

    def person(self, user):
        """`user`'s one canonical instance (memos like `subtree_ids` live
        on the instance), or `user` itself when not a member here."""
        if user is None:
            return None
        return self.people().get(user.pk, user)

    def _can_see(self, user, label):
        key = (user.pk, label)
        if key not in self._visible:
            # SOC2:AUTH-02 work is routed only to people who can open its record
            rows = visible_customers(user) if label == "Customer" else visible_accounts(user)
            ids = self._ids[label]
            if ids is not None:
                rows = rows.filter(pk__in=sorted(ids))
            self._visible[key] = set(rows.values_list("pk", flat=True))
        return self._visible[key]

    def working(self):
        """The ids of the members active for work (`standing`), read once."""
        if self._working is None:
            self._working = working_ids(self.organisation)
        return self._working

    def opens(self, user, record):
        user = self.person(user)
        # SOC2:AUTH-02 a suspended or revoked member is given no work
        if user is None or user.pk not in self.working():
            return False
        label = type(record).__name__
        ids = self._ids.get(label)
        if ids is not None and record.pk not in ids:
            key = (user.pk, label, record.pk)
            if key not in self._unlisted:
                # SOC2:AUTH-02 work is routed only to people who can open its record
                self._unlisted[key] = can_open(user, record)
            return self._unlisted[key]
        return record.pk in self._can_see(user, label)

    def manager(self, user):
        manager_id = getattr(user, "reports_to_id", None)
        if manager_id is None:
            return None
        return self.people().get(manager_id) or user.reports_to

    def named(self, name):
        """The member the AI agent's proposal names, asked once per name."""
        if name not in self._named:
            from services.metrics.proposals import match_member

            self._named[name] = self.person(match_member(self.organisation, name))
        return self._named[name]

    def function_owner(self, customer, function):
        if self._function_owners is None:
            from services.knowledge.models import FunctionOwner

            self._function_owners = {
                (owner.customer_id, owner.function): owner.user
                for owner in FunctionOwner.objects.filter(
                    customer__organisation=self.organisation
                ).select_related("user")
            }
        return self._function_owners.get((customer.pk, function))

    def candidates(self, signal):
        if signal.agent_action is not None:
            action = signal.agent_action
            payload = action.payload if isinstance(action.payload, dict) else {}
            if action.kind == "task.create":
                if isinstance(payload.get("assignee_id"), int):
                    yield self.person(self.people().get(payload["assignee_id"]))
                elif payload.get("assignee_name"):
                    yield self.named(str(payload["assignee_name"]))
            yield self.person(signal.record.owner)
            return
        function = FUNCTION_FOR.get(signal.kind)
        if function is not None:
            yield self.person(self.function_owner(signal.customer, function))
        yield self.person(signal.record.owner)

    def suggested(self, signal):
        for person in self.candidates(signal):
            if self.opens(person, signal.record):
                return person
        return None

    def fallbacks(self):
        """View-all members active for work (`standing`) by join date, then
        the workspace's owner when active for work.
        Read once per router. Each member's capability is still resolved on
        its own (`has_capability`: membership standing, tenant status,
        superuser), which no bulk query reproduces cleanly; that is a fixed
        cost per member, never per record."""
        if self._fallbacks is None:
            from services.identity.ownership import owner_membership

            working = self.working()
            # SOC2:AUTH-02 a suspended or revoked member is no fallback
            people = [
                member
                for member in self.people().values()
                if member.pk in working and member.has_capability(Capability.VIEW_ALL_ACCOUNTS)
            ]
            owner = owner_membership(self.organisation)
            if owner is not None and owner.user_id in working:
                people.append(self.person(owner.user))
            self._fallbacks = people
        return self._fallbacks

    def reads_source(self, user, signal):
        """Whether `user` may read the signal's draft reply's source; True
        for any other signal. One query per person over the workspace's
        proposed draft replies, never per record."""
        action = signal.agent_action
        if action is None or action.kind != DRAFT_REPLY:
            return True
        if action.status != PROPOSED:
            return may_read_source(user, action)
        if user.pk not in self._unreadable:
            # SOC2:AUTH-02 a draft reply is routed only to a reader of its source
            self._unreadable[user.pk] = set(
                unreadable_draft_ids(user).filter(status=PROPOSED).values_list("id", flat=True)
            )
        return action.pk not in self._unreadable[user.pk]

    def qualifies(self, user, signal):
        return self.opens(user, signal.record) and self.reads_source(self.person(user), signal)

    def route(self, signal):
        suggested = self.suggested(signal)
        if suggested is not None and not self.reads_source(suggested, signal):
            suggested = None
        if suggested is not None:
            manager = self.manager(suggested)
            if self.recommend_to == WorkSettings.RecommendTo.MANAGER and self.qualifies(
                manager, signal
            ):
                return Route(suggested, manager)
            return Route(suggested, suggested)
        if signal.agent_action is not None and signal.agent_action.kind == DRAFT_REPLY:
            return None
        for person in self.fallbacks():
            if self.opens(person, signal.record):
                return Route(None, person)
        return None
