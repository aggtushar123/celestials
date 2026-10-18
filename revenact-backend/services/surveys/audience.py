"""Who a survey reaches (spec §1.2).

`resolve` is the one function behind the builder's audience count and the
send itself; the send calls it again under its claim and never trusts a
list from the client. Everything is read from the viewer's own view: the
segment's members as they may see them, then only contacts they may open.
Skips are counted, never named.
"""

from collections import Counter
from dataclasses import dataclass, field
from datetime import timedelta

from django.db.models import Case, IntegerField, Q, Value, When
from django.utils import timezone

from services.customers.models import Account, Contact
from services.customers.scoping import visible_children_q
from services.segments.evaluate import members_queryset, visible_records

from .models import PER_RECORD_CAP, QUIET_DAYS, SurveyInvite


@dataclass
class Audience:
    """The people a send reaches, in send order, and what was left out."""

    people: list = field(default_factory=list)
    skipped_recent: int = 0
    skipped_no_email: int = 0
    skipped_cap: int = 0
    hidden_count: int = 0

    @property
    def organisations(self):
        """Distinct records reached: each organisation and each account once."""
        return len({(person.customer_id, person.account_id) for person in self.people})

    def counts(self):
        return {
            "audience": len(self.people),
            "organisations": self.organisations,
            "skipped_recent": self.skipped_recent,
            "skipped_no_email": self.skipped_no_email,
            "skipped_cap": self.skipped_cap,
            "hidden_count": self.hidden_count,
        }


def _pool(segment, roles, members):
    """Active contacts with a ticked role on the segment's members: an
    organisation's own and its accounts' contacts, or an account's own.
    Subqueries, not joins, so nobody is listed twice."""
    ids = members.order_by().values("pk")
    if segment.kind == "customer":
        accounts = Account.objects.filter(customers__in=ids).values("pk")
        reach = Q(customer__in=ids) | Q(account__in=accounts)
    else:
        reach = Q(account__in=ids)
    return Contact.objects.filter(reach, status=Contact.Status.ACTIVE, role__in=roles)


def _candidates(segment, roles, viewer, members):
    """(candidates in send order, how many the viewer cannot open, whether
    the per-record cap applies)."""
    if segment.kind == "contact":
        people = members.filter(status=Contact.Status.ACTIVE).order_by("name", "pk")
        return list(people), 0, False
    pool = _pool(segment, roles, members)
    # SOC2:AUTH-02 only people the viewer may open; the rest are a count that names nobody
    seen = pool.filter(visible_children_q(viewer))
    hidden = pool.exclude(pk__in=seen.values("pk")).count()
    rank = Case(
        *(When(role=role, then=Value(index)) for index, role in enumerate(roles)),
        output_field=IntegerField(),
    )
    people = seen.annotate(role_rank=rank).order_by("role_rank", "name", "pk")
    return list(people), hidden, True


def reach(kind, roles, viewer, members):
    """`_candidates` for a segment kind and members that are not a saved
    segment (an agent's unsaved definition, counted for the preview)."""
    from types import SimpleNamespace

    return _candidates(SimpleNamespace(kind=kind), roles, viewer, members)


def candidates(segment, roles, viewer, *, today, records=None):
    """(people in send order, how many the viewer cannot open, whether the
    per-record cap applies): the segment's members as `viewer` sees them,
    or `records` (ids of the segment's kind) in their place, turned into
    people. Shared with Campaigns, so both features agree on who a segment
    reaches."""
    if records is None:
        members = members_queryset(segment, viewer, today=today)
    else:
        # SOC2:AUTH-02 a rule's fired records, read through the viewer's own visibility
        members = visible_records(segment.kind, viewer).filter(pk__in=list(records))
    return _candidates(segment, roles, viewer, members)


def resolve(segment, roles, viewer, *, today, now=None, records=None):
    """The people `segment` reaches for `viewer` with `roles` ticked. The
    no-email and 30-day skips come first; the cap of three per record then
    applies to who is left.

    `records`, when given, are ids of the segment's kind that replace its
    members: a rule's survey goes to the records it fired on, including one
    that has since left the segment, and still only to those the viewer may
    open."""
    now = now or timezone.now()
    people, hidden, capped = candidates(segment, roles, viewer, today=today, records=records)
    recent = set(
        SurveyInvite.objects.filter(
            contact_id__in=[person.pk for person in people],
            created_at__gte=now - timedelta(days=QUIET_DAYS),
        )
        .exclude(status=SurveyInvite.Status.FAILED)
        .values_list("contact_id", flat=True)
    )
    audience = Audience(hidden_count=hidden)
    per_record = Counter()
    for person in people:
        if not person.email.strip():
            audience.skipped_no_email += 1
            continue
        if person.pk in recent:
            audience.skipped_recent += 1
            continue
        record = (person.customer_id, person.account_id)
        if capped and per_record[record] >= PER_RECORD_CAP:
            audience.skipped_cap += 1
            continue
        per_record[record] += 1
        audience.people.append(person)
    return audience
