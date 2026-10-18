"""Me, My team and Company: which slice of the book a reader's Brain reads.

`resolve` is the only constructor of a Scope; it and `book_actor` are the
only places a `ScopeActor` is built (a test greps for it). Every Brain
route resolves the reader's `?scope=` here, so a scope the reader may not
use is refused before any figure is computed.
"""

from dataclasses import dataclass

from services.accounts.hierarchy import subtree_ids
from services.accounts.models import User
from services.customers.scoping import ScopeActor, SystemActor, sees_everything
from services.metrics.models import COMPANY_SCOPE

ME, TEAM, COMPANY = "me", "team", COMPANY_SCOPE
LABELS = {ME: "Me", TEAM: "My team", COMPANY: "Company"}


class ScopeUnknown(Exception):
    code = "SCOPE_UNKNOWN"
    detail = "Choose me, team or company."


class ScopeNotAllowed(Exception):
    code = "SCOPE_NOT_ALLOWED"
    detail = "You can't see that view."


@dataclass(frozen=True)
class Scope:
    key: str
    stored_key: str
    owner_ids: frozenset | None
    label: str
    actor: object
    #: The person the scope belongs to: the reader who resolved it.
    user: object

    @property
    def is_company(self):
        return self.key == COMPANY


def available(reader):
    """The scopes `reader` may use, narrowest first."""
    # SOC2:AUTH-02 My team needs reports; Company needs view_all_accounts or Leadership
    keys = [ME]
    if subtree_ids(reader):
        keys.append(TEAM)
    if sees_everything(reader) or reader.function == User.Function.LEADERSHIP:
        keys.append(COMPANY)
    return keys


def default_key(reader):
    """The widest scope the reader has."""
    return available(reader)[-1]


def resolve(reader, key):
    """The reader's scope for `key`, or ScopeUnknown / ScopeNotAllowed."""
    if key not in LABELS:
        raise ScopeUnknown(key)
    # SOC2:AUTH-02 a scope the reader may not use is refused before anything is read
    if key not in available(reader):
        raise ScopeNotAllowed(key)
    organisation = reader.organisation
    if key == COMPANY:
        return Scope(COMPANY, COMPANY, None, LABELS[COMPANY], SystemActor(organisation), reader)
    owners = frozenset({reader.id}) if key == ME else frozenset({reader.id, *subtree_ids(reader)})
    # SOC2:AUTH-02 the book is the owners'; what is counted in it is the reader's to read
    return Scope(key, f"{key}:{reader.id}", owners, LABELS[key], ScopeActor(reader, owners), reader)


def book_actor(principal, member_id):
    """One person's book (an owner-cut initiative's), counted by the rules
    of `principal`: the reader for a live read, the creator for a Brain
    initiative's starting line."""
    # SOC2:AUTH-02 an owner cut is read as a real person over that one book,
    # never as the organisation
    return ScopeActor(principal, {int(member_id)})
