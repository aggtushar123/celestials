"""The account owner: one accountable person per customer — and per account
— from any function.

Ownership used to mean "the CSM"; now it means the person on the hook
for the relationship, whoever they are, with the per-function owners
(services.knowledge.FunctionOwner) as the team around them. Two rules
live here so every path that changes an owner behaves the same:

- **Who may change it**: the current owner, anyone above them in the
  chart, or an organisation-settings manager. An unowned customer may be
  claimed by anyone.
- **A change is an event, not an edit**: the change and its handover note
  are written down as a contribution from the person who made it, so the
  history of who held an account and why it moved is knowledge the
  Copilot can answer from. The new owner is notified by the caller.
"""

from services.accounts.capabilities import Capability
from services.accounts.hierarchy import ancestors


class OwnershipDenied(Exception):
    """The actor may not change this customer's owner."""


def may_change_owner(actor, owned):
    """`owned` is a Customer or an Account: anything with an `owner`."""
    if owned.owner_id is None or owned.owner_id == actor.id:
        return True
    if actor.has_capability(Capability.MANAGE_ORG_SETTINGS):
        return True
    return actor.id in {a.id for a in ancestors(owned.owner)}


def record_handover(customer, actor, previous_owner, note=""):
    """Write the change down. Returns the contribution, or None when the
    owner did not actually change."""
    from .models import Contribution

    if previous_owner == customer.owner:
        return None
    was = previous_owner.name if previous_owner else "nobody"
    now = customer.owner.name if customer.owner else "nobody"
    body = f"Account owner changed from {was} to {now}."
    if note.strip():
        body += f" {note.strip()}"
    return Contribution.objects.create(
        organisation=customer.organisation,
        customer=customer,
        author=actor,
        function=actor.function,
        body=body,
    )


def record_account_handover(account, actor, previous_owner, note=""):
    """The same record for an account's owner, written on every customer
    the account belongs to (knowledge hangs off customers). Returns the
    contributions, or [] when the owner did not actually change."""
    from .models import Contribution

    if previous_owner == account.owner:
        return []
    was = previous_owner.name if previous_owner else "nobody"
    now = account.owner.name if account.owner else "nobody"
    body = f"Owner of account {account.name} changed from {was} to {now}."
    if note.strip():
        body += f" {note.strip()}"
    return [
        Contribution.objects.create(
            organisation=customer.organisation,
            customer=customer,
            author=actor,
            function=actor.function,
            body=body,
        )
        for customer in account.customers.all()
    ]


def handler_for(record, function, *, organisation_id=None):
    """Who handles `record` (a Customer or an Account) in `function`
    (Slack escalations D2, spec §4.3, SE2-7). Returns `(user, via)`:

    1. the account team: for Customer Success the record's owner (any
       function), for any other function the customer's `FunctionOwner`,
       when on duty (`heads.on_duty`): `"team"`;
    2. else the function's head in the record's own workspace, when on
       duty: `"head"`;
    3. else `(None, "nobody")`.

    An account's own owner comes first for Customer Success (owner ruling,
    2026-10-16). Otherwise an account with exactly one parent customer
    takes that customer's answer, and one with none or several falls to
    the function's head. The record's own workspace always decides whose
    head is read (a customer's, or its account's first parent's);
    `organisation_id` is only the fallback for an account with no parent,
    and must come from the server side (the caller's or the bundle's
    workspace), never from client input."""
    from services.accounts.models import User
    from services.customers.models import Account

    from .heads import head_for, on_duty
    from .models import FunctionOwner

    if function not in User.Function.values:
        raise ValueError(f"Unknown function: {function!r}")
    if isinstance(record, Account):
        if function == User.Function.CS and on_duty(record.owner):
            return record.owner, "team"
        # The owner rides along, so a parent's Customer Success hit costs no query.
        parents = list(record.customers.select_related("owner")[:2])
        if len(parents) == 1:
            return handler_for(parents[0], function)
        if parents:
            organisation_id = parents[0].organisation_id
    else:
        organisation_id = record.organisation_id
        if function == User.Function.CS:
            if on_duty(record.owner):
                return record.owner, "team"
        else:
            owner = (
                FunctionOwner.objects.filter(customer=record, function=function)
                .select_related("user")
                .first()
            )
            if owner is not None and on_duty(owner.user, function):
                return owner.user, "team"
    head = head_for(organisation_id, function)
    return (head, "head") if head is not None else (None, "nobody")
