"""What customers are saying: the asks, anomalies, survey scores and
contact sentiment in a scope's book (spec: react-ts-app docs/superpowers/
specs/2026-10-05-brain-customers-design.md §1.3).

Whose book: `services.brain.book` (Me, My team, or the whole organisation
for Company). Inside it everything is counted and named by the reader's own
rights, never the scope's: revenue and scores only over records the reader
may open, comments named only on those (the rest counted in `hidden`),
contacts only those the reader may open.

Each section is a fixed number of queries whatever its length, and every
filter is an `id IN (subquery)`, never a join made unique with DISTINCT
(Postgres 16, services.customers.scoping). A test checks every query
`build` runs for DISTINCT."""

from datetime import datetime, time, timedelta

from django.db.models import Min
from django.utils import timezone

from services.anomalies.views import rows_for as anomaly_rows
from services.customers.models import Contact
from services.customers.scoping import visible_children_q
from services.requests.views import rows_for as request_rows
from services.surveys.access import readable_send_ids
from services.surveys.models import WINDOW_DAYS, SurveyInvite
from services.surveys.questions import CES, CSAT, NPS
from services.surveys.scores import figure, whole_figure

from . import book

#: Rows the Asks and Anomalies sections carry; `total` is the full count.
TOP = 5
#: Latest comments shown.
COMMENTS = 5
#: Under this many answers in a window, its figure is not shown.
MIN_RESPONSES = 5
SURVEY_TYPES = (NPS, CSAT, CES)
#: Most contacts listed as turned negative, and how far back.
TURNED = 10
TURNED_DAYS = 30


def day_start(day):
    return timezone.make_aware(datetime.combine(day, time.min))


def record(row):
    """`{type, id, name}` of the customer or account a row hangs off."""
    if row.account_id:
        return {"type": "account", "id": row.account_id, "name": row.account.name}
    return {"type": "customer", "id": row.customer_id, "name": row.customer.name}


# ── Asks and anomalies ───────────────────────────────────────────────────


def asks(reader, scope):
    """The top of `/requests/?scope=`: the same rows, in the same order."""
    rows = request_rows(reader, scope=scope)
    return {
        "total": len(rows),
        "top": [
            {
                "id": row["id"],
                "title": row["title"],
                "status": row["status"],
                "arr": float(row["arr"]),
                "companies": row["companies"],
                "last_90_days": row["last_90_days"],
                "previous_90_days": row["previous_90_days"],
            }
            for row in rows[:TOP]
        ],
    }


def anomalies(reader, scope):
    """The top of `/anomalies/?scope=`, titles gated as there (`title_for`)."""
    rows = anomaly_rows(reader, scope=scope)
    return {
        "total": len(rows),
        "top": [
            {
                "id": row["id"],
                "title": row["title"],
                "status": row["status"],
                "arr": float(row["arr"]),
                "companies": row["companies"],
                "last_seen_at": row["last_seen_at"],
            }
            for row in rows[:TOP]
        ],
    }


# ── Scores ───────────────────────────────────────────────────────────────


def _answers(reader, scope, since):
    """Answers on the scope's book, from sends the reader may read,
    answered since `since`: whoever's record they are on."""
    # SOC2:AUTH-02 an answer is read only from a send the reader may read
    answered = SurveyInvite.objects.filter(
        status=SurveyInvite.Status.ANSWERED,
        answered_at__gte=since,
        send_id__in=readable_send_ids(reader),
    )
    on_book = book.q(scope)
    return answered if on_book is None else answered.filter(on_book)


def _shown(survey_type, scores):
    """The window's figure, or None under MIN_RESPONSES answers."""
    if len(scores) < MIN_RESPONSES:
        return None
    if survey_type == NPS:
        return whole_figure(NPS, scores)
    return float(figure(survey_type, scores))


def scores(reader, scope, today):
    """NPS, CSAT and CES over the last 90 days against the 90 before, from
    the answers themselves, and the latest comments. Four queries."""
    current = day_start(today - timedelta(days=WINDOW_DAYS))
    previous = day_start(today - timedelta(days=2 * WINDOW_DAYS))
    in_scope = _answers(reader, scope, previous)
    # SOC2:AUTH-02 scores count only answers on records the reader may open
    readable = in_scope.filter(visible_children_q(reader))
    windows = {survey_type: ([], []) for survey_type in SURVEY_TYPES}
    for survey_type, score, answered_at, customer_id in readable.values_list(
        "send__survey_type", "score", "answered_at", "customer_id"
    ):
        if survey_type == CES and customer_id is None:
            continue  # accounts carry no CES
        now, then = windows[survey_type]
        (now if answered_at >= current else then).append(score)
    out = {
        survey_type: {
            "now": _shown(survey_type, now),
            "then": _shown(survey_type, then),
            "responses": len(now),
            "previous_responses": len(then),
        }
        for survey_type, (now, then) in windows.items()
    }
    commented = in_scope.filter(answered_at__gte=current).exclude(comment="")
    # SOC2:AUTH-02 a comment is named only on a record the reader may open;
    # the rest are counted in `hidden`
    named = commented.filter(visible_children_q(reader))
    latest = named.select_related("send", "customer", "account").order_by("-answered_at", "-id")[
        :COMMENTS
    ]
    out["comments"] = [
        {
            "survey_type": invite.send.survey_type,
            "score": invite.score,
            "comment": invite.comment,
            "record": record(invite),
            "answered_at": invite.answered_at,
        }
        for invite in latest
    ]
    out["hidden"] = commented.count() - named.count()
    return out


# ── Sentiment ────────────────────────────────────────────────────────────


def sentiment(reader, scope, today):
    """How many contacts on the scope's book the reader may open are
    negative, and who of them turned negative in the last TURNED_DAYS,
    newest first. Three queries."""
    # SOC2:AUTH-02 a contact is counted and named only on a record the reader may open
    readable = Contact.objects.filter(visible_children_q(reader))
    on_book = book.q(scope)
    contacts = readable if on_book is None else readable.filter(on_book)
    negative = Contact.Sentiment.NEGATIVE
    since = day_start(today - timedelta(days=TURNED_DAYS))
    turned = (
        contacts.filter(sentiment=negative, sentiment_changed_at__gte=since)
        .select_related("customer", "account")
        .order_by("-sentiment_changed_at", "-id")[:TURNED]
    )
    first = readable.aggregate(first=Min("sentiment_changed_at"))["first"]
    return {
        "negative": contacts.filter(sentiment=negative).count(),
        "tracking_since": timezone.localdate(first).isoformat() if first else None,
        "turned_negative": [
            {
                "contact": {"id": contact.id, "name": contact.name},
                "record": record(contact),
                "previous": contact.previous_sentiment,
                "changed_at": contact.sentiment_changed_at,
            }
            for contact in turned
        ],
    }


# ── The page ─────────────────────────────────────────────────────────────


def build(reader, scope, today):
    """`GET customers/`: the scope's asks, anomalies, scores and sentiment,
    each counted and named by the reader's own rights."""
    return {
        "scope": scope.key,
        "currency": reader.organisation.currency,
        "asks": asks(reader, scope),
        "anomalies": anomalies(reader, scope),
        "scores": scores(reader, scope, today),
        "sentiment": sentiment(reader, scope, today),
    }
