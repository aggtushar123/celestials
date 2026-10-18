"""Work › Team's "Waiting on your team" (Work in one place, delivery 2
contract §1; Agent bundles §10.2): the feed's shape over the scope's
people other than the reader (Rest of company: other than the reader's
own team, D7), in three groups, cut by `?kind=`. Each source runs in its
own savepoint (`feed.attempt`), so one failing only adds its kind to
`failed`; pages are the feed's keyset cursors."""

from . import feed_team_decide
from .feed import attempt, ordered
from .feed_shape import (
    BUNDLE,
    DECIDE,
    PAGE,
    QUESTION,
    RULE_REVIEW,
    SUGGESTED,
    SUGGESTION,
    TASK,
    decode,
    group,
    parse_kinds,
)
from .feed_team_suggest import TeamSuggestions
from .feed_team_tasks import TeamOverdue

OVERDUE = "overdue"
TEAM_GROUPS = (DECIDE, OVERDUE, SUGGESTED)
#: In the order a tie on `at` is broken (the feed's).
TEAM_DECIDE_KINDS = (RULE_REVIEW, BUNDLE, QUESTION)
#: The kinds `?kind=` may name (Agent bundles §10.2).
TEAM_KINDS = (BUNDLE, RULE_REVIEW, QUESTION, TASK, SUGGESTION)
CHOOSE_TEAM_GROUP = "Choose decide, overdue or suggested."
CHOOSE_TEAM_KIND = "Choose bundle, rule_review, question, task or suggestion."


def parse_team_kinds(raw):
    """`?kind=` as a set of Team kinds (the feed's rule over `TEAM_KINDS`)."""
    return parse_kinds(raw, TEAM_KINDS, CHOOSE_TEAM_KIND)


def _decide(reader, scope, after, failed, kinds):
    count = hidden = 0
    rows = []
    for kind in TEAM_DECIDE_KINDS:
        if kind not in kinds:
            continue

        def run(kind=kind):
            source = feed_team_decide.MAKERS[kind](reader, scope)
            return source.count(), source.hidden(), source.page(after, PAGE + 1)

        got = attempt([kind], failed, run)
        if got is not None:
            count += got[0]
            hidden += got[1]
            rows += got[2]
    rows.sort(key=lambda row: row[0])
    return group(DECIDE, count, rows), hidden


def _one(key, kind, make, after, failed):
    def run():
        source = make()
        return source.count(), source.hidden(), source.page(after, PAGE + 1)

    got = attempt([kind], failed, run)
    if got is None:
        return group(key, 0, []), 0
    return group(key, got[0], got[2]), got[1]


def _overdue(reader, scope, today, after, failed, kinds):
    if TASK not in kinds:
        return group(OVERDUE, 0, []), 0
    return _one(OVERDUE, TASK, lambda: TeamOverdue(reader, scope, today), after, failed)


def _suggested(reader, scope, today, after, failed, kinds):
    if SUGGESTION not in kinds:
        return group(SUGGESTED, 0, []), 0
    return _one(SUGGESTED, SUGGESTION, lambda: TeamSuggestions(reader, today, scope), after, failed)


def build(reader, scope, *, today, kinds=frozenset(TEAM_KINDS)):
    failed = []
    decide, decide_hidden = _decide(reader, scope, None, failed, kinds)
    overdue, overdue_hidden = _overdue(reader, scope, today, None, failed, kinds)
    suggested, suggested_hidden = _suggested(reader, scope, today, None, failed, kinds)
    return {
        "scope": scope.key,
        "groups": [decide, overdue, suggested],
        "hidden": decide_hidden + overdue_hidden + suggested_hidden,
        "failed": ordered(failed),
    }


def page(reader, scope, *, today, group_key, cursor, kinds=frozenset(TEAM_KINDS)):
    """One group's page after `cursor` (None: its first page)."""
    after = None if cursor is None else decode(group_key, cursor)
    failed = []
    if group_key == DECIDE:
        payload, _hidden = _decide(reader, scope, after, failed, kinds)
    elif group_key == OVERDUE:
        payload, _hidden = _overdue(reader, scope, today, after, failed, kinds)
    else:
        payload, _hidden = _suggested(reader, scope, today, after, failed, kinds)
    return {"scope": scope.key, "group": payload, "failed": ordered(failed)}


def counts(reader, scope, *, today):
    """The queue's count (Agent bundles D8): decide plus overdue, each source
    in its own savepoint; `(total, failed kinds)`."""
    failed = []
    total = 0
    for kind in TEAM_DECIDE_KINDS:
        got = attempt(
            [kind],
            failed,
            lambda kind=kind: (feed_team_decide.MAKERS[kind](reader, scope).count(),),
        )
        total += 0 if got is None else got[0]
    got = attempt([TASK], failed, lambda: (TeamOverdue(reader, scope, today).count(),))
    total += 0 if got is None else got[0]
    return total, ordered(failed)
