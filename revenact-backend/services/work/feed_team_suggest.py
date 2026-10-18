"""The Team queue's suggestions (Work in one place, delivery 2 contract
§1.4, Decision D5): open recommendations of the four live kinds that the
reader may decide (`rec_access.decidable`, the rule behind Recommended's
My team), sent to someone in scope other than the reader, on records the
reader may open. Ones the reader may not decide are neither listed nor
counted. A row offers Assign and Dismiss; Add to my work is My work's."""

from . import feed_suggest
from .feed_suggest import KINDS
from .rec_access import TEAM, decidable, openable
from .team_scope import people


class TeamSuggestions(feed_suggest.Suggestions):
    def __init__(self, reader, today, scope):
        self.reader, self.today = reader, today
        # SOC2:AUTH-02 only what the reader may decide, sent to someone in scope but them
        self.waiting = (
            decidable(reader, TEAM)
            .filter(kind__in=KINDS)
            .filter(recipient_id__in=people(reader, scope))
        )
        # SOC2:AUTH-02 named only on records the reader may open; the rest counted
        self.readable = openable(reader, self.waiting)

    def page(self, after, limit):
        return [
            (
                position,
                {
                    **entry,
                    "actions": ["assign", "dismiss"],
                    "for": dict(entry["detail"]["recipient"]),
                },
            )
            for position, entry in super().page(after, limit)
        ]
