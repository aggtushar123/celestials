"""Who answered and who has not, as the reader may see them (spec §1.6).

Rows name only people on records the reader may open; the rest are a count
that names nobody. An invite's own record (its organisation or account,
copied from the contact at send time) carries the rule, so an answer whose
contact was deleted still follows it."""

import json
from base64 import urlsafe_b64decode, urlsafe_b64encode
from datetime import datetime

from django.db.models import Q

from services.customers.scoping import visible_children_q
from services.organizations.rows import iso

from .models import SurveyInvite
from .questions import LOW, band_of

PAGE_SIZE = 50
FILTERS = ("all", "detractors", "comments")


def encode_cursor(invite):
    raw = json.dumps([invite.answered_at.isoformat(), invite.pk])
    return urlsafe_b64encode(raw.encode()).decode()


def decode_cursor(cursor):
    """(answered_at, id) after which the next page starts, or None (the
    first page) for a missing, malformed or tampered cursor."""
    if not cursor:
        return None
    try:
        when, pk = json.loads(urlsafe_b64decode(cursor.encode()))
        when = datetime.fromisoformat(when)
        pk = int(pk)
    except (ValueError, TypeError):
        return None
    return (when, pk) if when.tzinfo is not None else None


def _contact(invite):
    return (
        None if invite.contact is None else {"id": invite.contact.pk, "name": invite.contact.name}
    )


def _record(invite):
    if invite.account_id:
        return {"kind": "account", "id": invite.account_id, "name": invite.account.name}
    return {"kind": "customer", "id": invite.customer_id, "name": invite.customer.name}


def answers_page(send, viewer, params):
    """`?filter=all|detractors|comments&cursor=`: newest first, PAGE_SIZE a
    page. `hidden_count` is every answer the reader may not open, regardless
    of the filter."""
    choice = params.get("filter") if params.get("filter") in FILTERS else "all"
    answered = send.invites.filter(status=SurveyInvite.Status.ANSWERED)
    # SOC2:AUTH-02 answers are named only for people the reader may open; the rest are
    # one count over every answer, whatever the filter, so comparing filters reveals nothing
    seen = answered.filter(visible_children_q(viewer))
    hidden_count = answered.count() - seen.count()
    if choice == "detractors":
        seen = seen.filter(score__lte=LOW[send.survey_type])
    elif choice == "comments":
        seen = seen.exclude(comment="")
    rows = seen.select_related("contact", "customer", "account").order_by("-answered_at", "-pk")
    after = decode_cursor(params.get("cursor"))
    if after is not None:
        when, pk = after
        rows = rows.filter(Q(answered_at__lt=when) | Q(answered_at=when, pk__lt=pk))
    page = list(rows[: PAGE_SIZE + 1])
    more = len(page) > PAGE_SIZE
    page = page[:PAGE_SIZE]
    return {
        "filter": choice,
        "results": [
            {
                "id": invite.pk,
                "contact": _contact(invite),
                "record": _record(invite),
                "score": invite.score,
                "band": band_of(send.survey_type, invite.score),
                "comment": invite.comment,
                "answered_at": iso(invite.answered_at),
            }
            for invite in page
        ],
        "next_cursor": encode_cursor(page[-1]) if more else None,
        "hidden_count": hidden_count,
    }


def pending_rows(send, viewer, *, now):
    """Everyone not answered (pending, expired or failed), by name. A send
    has at most 500 people, so there is no paging. The email address is
    never returned."""
    waiting = send.invites.exclude(status=SurveyInvite.Status.ANSWERED)
    # SOC2:AUTH-02 named only for people the reader may open; the rest are a count
    seen = (
        waiting.filter(visible_children_q(viewer))
        .select_related("contact", "customer", "account")
        .order_by("contact__name", "pk")
    )
    rows = []
    for invite in seen:
        state = invite.status
        if state == SurveyInvite.Status.PENDING and invite.expires_at <= now:
            state = "expired"
        rows.append(
            {
                "id": invite.pk,
                "contact": _contact(invite),
                "record": _record(invite),
                "status": state,
                "expires_at": iso(invite.expires_at),
                "failure": invite.failure or None,
            }
        )
    return {"results": rows, "hidden_count": waiting.count() - len(rows)}
