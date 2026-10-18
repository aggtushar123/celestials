"""The feed's suggested group (Work in one place, spec §4.1): open
recommendations sent to the reader (`rec_access.decidable(reader, "me")`)
of the four kinds the feed shows nowhere else, on records they may open,
newest first. Overdue tasks, open questions and agent actions are already
in the feed as themselves, so their recommendations are left out."""

from .clock import working_days_for
from .feed_shape import SUGGESTION, after_q, item, record_ref
from .models import Recommendation
from .rec_access import ME, decidable, openable
from .recommendations import LIST_RELATED, Opens, row_payload

K = Recommendation.Kind
KINDS = (K.RENEWAL_DUE, K.HEALTH_DROP, K.URGENT_TICKETS, K.ANOMALY)
FROM = {"type": "revenact", "label": "Revenact"}
ORDER = ("created_at", "id")


class Suggestions:
    kind = SUGGESTION

    def __init__(self, reader, today):
        self.reader, self.today = reader, today
        self.waiting = decidable(reader, ME).filter(kind__in=KINDS)
        # SOC2:AUTH-02 named only on records the reader may open; the rest counted
        self.readable = openable(reader, self.waiting)

    def count(self):
        return self.readable.count()

    def hidden(self):
        return self.waiting.count() - self.count()

    def page(self, after, limit):
        rows = self.readable.select_related(*LIST_RELATED)
        if after is not None:
            rows = rows.filter(after_q(ORDER, after, descending=True))
        recs = list(rows.order_by("-created_at", "-id")[:limit])
        if not recs:
            return []
        opens = Opens(recs)
        days = working_days_for(self.reader.organisation)
        return [
            (
                (rec.created_at, rec.pk),
                item(
                    key=f"recommendation:{rec.pk}",
                    kind=SUGGESTION,
                    pk=rec.pk,
                    title=rec.title,
                    record=record_ref(rec.record),
                    source=FROM,
                    at=rec.created_at,
                    actions=["add", "assign", "dismiss"],
                    detail=row_payload(
                        rec, today=self.today, opens=opens, working_days=days, reader=self.reader
                    ),
                ),
            )
            for rec in recs
        ]
