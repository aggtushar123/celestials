"""Tonight's records for one rule (spec §1.4, steps 2–3): its matches as
the owner may open them, less those fired within the cooldown, then at most
200, lowest id first. Read only: the nightly step and the builder's test
call the same function."""

from dataclasses import dataclass, field
from datetime import timedelta

from .models import NIGHTLY_CAP, RuleState
from .triggers import matches


@dataclass
class Selection:
    kind: str
    fire: list = field(default_factory=list)
    cooldown: list = field(default_factory=list)
    cap: int = 0
    not_visible: int = 0
    values: dict = field(default_factory=dict)

    @property
    def matched(self):
        """Every match the owner may open, whatever became of it."""
        return len(self.fire) + len(self.cooldown) + self.cap

    def skipped(self, failed=0, nobody=0):
        return {
            "cooldown": len(self.cooldown),
            "cap": self.cap,
            "not_visible": self.not_visible,
            "failed": failed,
            "nobody": nobody,
        }


def recently_fired(state_rule_id, kind, cooldown_days, *, today):
    """Records the rule fired on within its cooldown: on a date after
    `today - cooldown_days`. Fired on 1 October with 30 days, a record fires
    again from 31 October."""
    since = today - timedelta(days=cooldown_days)
    rows = RuleState.objects.filter(
        rule_id=state_rule_id, record_kind=kind, last_fired_on__gt=since
    )
    return set(rows.values_list("record_id", flat=True))


def select(rule, owner, *, today, preview=False, state_rule_id=None):
    """`state_rule_id` is the saved rule whose stored scores and fired dates
    apply (None for an unsaved rule: nothing stored, nothing cooling down)."""
    match = matches(rule, owner, today=today, preview=preview, state_rule_id=state_rule_id)
    recent = set()
    if state_rule_id is not None and match.ids:
        recent = recently_fired(state_rule_id, match.kind, rule.cooldown_days, today=today)
    eligible = [pk for pk in match.ids if pk not in recent]
    return Selection(
        kind=match.kind,
        fire=eligible[:NIGHTLY_CAP],
        cooldown=[pk for pk in match.ids if pk in recent],
        cap=max(len(eligible) - NIGHTLY_CAP, 0),
        not_visible=match.not_visible,
        values=match.values,
    )
