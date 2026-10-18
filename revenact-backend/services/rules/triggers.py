"""Which records a rule matches tonight (spec §1.2), as its owner sees
their book. Nothing here writes: the nightly step stores `Match.values`
itself, and the builder's test reads the same answer with `preview=True`.

- entered / left: today's `SegmentChange` rows for the rule's segment.
- crossed: members whose score is past the line tonight and whose stored
  value was not. A member with no stored value is a first sight: stored by
  the nightly step, never fired on.
- schedule: every member, on the rule's weekday or on the 1st.
"""

from dataclasses import dataclass, field
from decimal import Decimal

from services.segments.evaluate import MODELS, member_ids, members_queryset
from services.segments.models import SegmentChange

from .models import Rule, RuleState
from .records import openable

#: The column each score reads, by segment kind. Accounts have no CES and
#: contacts no scores; validation refuses both.
SCORE_FIELDS = {
    ("customer", "csat"): "csat_score",
    ("customer", "nps"): "nps_score",
    ("customer", "ces"): "ces_percentage",
    ("customer", "health"): "health_score",
    ("account", "csat"): "csat_score",
    ("account", "nps"): "nps_score",
    ("account", "health"): "health_score",
}


@dataclass
class Match:
    """Tonight's matches: `ids` (sorted) the viewer may open, how many they
    may not (`not_visible`, never named), and for `crossed` every member's
    score tonight (`values`)."""

    kind: str
    ids: list = field(default_factory=list)
    not_visible: int = 0
    values: dict = field(default_factory=dict)


def on_side(rule, value):
    """Whether `value` is past the rule's line: strictly below or strictly above."""
    if rule.direction == Rule.Direction.BELOW:
        return value < rule.threshold
    return value > rule.threshold


def is_due(rule, today):
    """A weekly rule runs on its weekday (Monday = 0), a monthly one on the
    1st. `today` is the date in settings.TIME_ZONE. An unknown cadence
    (should never be saved; validation refuses it) is never due."""
    if rule.cadence == Rule.Cadence.WEEKLY:
        return today.weekday() == rule.weekday
    if rule.cadence == Rule.Cadence.MONTHLY:
        return today.day == 1
    return False


def _moved(rule, viewer, *, today, preview):
    segment = rule.segment
    if preview and segment.last_evaluated_on != today:
        # Not evaluated yet today: tonight's segments step will compare the
        # owner's members now with the last baseline. So does the preview.
        if segment.last_members is None:
            return Match(segment.kind)
        # `last_members` is a JSON array on the segment row, not a table, so
        # there is no subquery to wrap it in: both sides of the diff must be
        # materialised before Python can compute the set difference. The
        # result (`moved`, bounded by `MAX_TRACKED_MEMBERS`) then goes
        # through `openable` as a literal `pk__in` list, same as the
        # already-materialised change rows below — large, but bounded, and
        # only the builder's preview pays this cost, never the nightly step.
        now = set(member_ids(segment, viewer, today=today))
        before = set(segment.last_members)
        moved = sorted(now - before if rule.trigger == Rule.Trigger.ENTERED else before - now)
        total = len(moved)
    else:
        moved = SegmentChange.objects.filter(
            segment=segment, changed_on=today, change=rule.trigger
        ).values("record_id")
        total = moved.count()
    seen = sorted(openable(segment.kind, viewer, moved).values_list("pk", flat=True))
    return Match(segment.kind, seen, total - len(seen))


def _members(segment, viewer, *, today):
    """The segment's members, read as the owner, as a plain queryset over
    `MODELS[segment.kind]` filtered by an id subquery. `members_queryset`
    ends in `.distinct()` over the visibility joins for anyone without
    `view_all_accounts`; wrapping it in `pk__in` keeps that `DISTINCT`
    inside the subquery instead of on this (potentially wide) outer
    `SELECT` — the house rule against a multi-join `.distinct()` outside."""
    members = members_queryset(segment, viewer, today=today).values("pk")
    return MODELS[segment.kind].objects.filter(pk__in=members).order_by()


def _crossed(rule, viewer, *, today, preview, state_rule_id):
    kind = rule.segment.kind
    column = SCORE_FIELDS[(kind, rule.score)]
    members = _members(rule.segment, viewer, today=today)
    values = {
        pk: Decimal(value) for pk, value in members.values_list("pk", column) if value is not None
    }
    last = {}
    if state_rule_id is not None:
        stored = RuleState.objects.filter(
            rule_id=state_rule_id, record_kind=kind, last_value__isnull=False
        )
        last = dict(stored.values_list("record_id", "last_value"))
    fired = []
    for pk, value in values.items():
        if not on_side(rule, value):
            continue
        before = last.get(pk)
        if before is None:
            # A first sight: tonight it is stored, and it fires from tomorrow.
            # The builder's test shows who is past the line now.
            if preview:
                fired.append(pk)
        elif not on_side(rule, before):
            fired.append(pk)
    return Match(kind, sorted(fired), 0, values)


def _scheduled(rule, viewer, *, today):
    kind = rule.segment.kind
    if not is_due(rule, today):
        return Match(kind)
    ids = sorted(_members(rule.segment, viewer, today=today).values_list("pk", flat=True))
    return Match(kind, ids)


def matches(rule, viewer, *, today, preview=False, state_rule_id=None):
    """The records `rule` matches on `today` that `viewer` (its owner) may
    open. `state_rule_id` names the rule whose stored scores to compare
    with (None: nothing stored). `preview` answers the builder's test
    before tonight's run (see Decision 19)."""
    if rule.trigger in (Rule.Trigger.ENTERED, Rule.Trigger.LEFT):
        return _moved(rule, viewer, today=today, preview=preview)
    if rule.trigger == Rule.Trigger.CROSSED:
        return _crossed(rule, viewer, today=today, preview=preview, state_rule_id=state_rule_id)
    return _scheduled(rule, viewer, today=today)
