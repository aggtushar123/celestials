"""Kept for Ask Revenact's grounding (`copilot.brain_grounding`); the page and
its routes are gone (Work in one place, delivery 2).

`services.agents.deciding.decided_as` is the one rule for who may decide an
agent action, and `may_decide` adds the owner-change right an owner change
needs.
"""

from datetime import datetime, time

from django.utils import timezone

from services.agents.deciding import may_decide

#: Most items a list carries; `counts` stay the full totals.
LIMIT = 200
QUESTION_TITLE = 200


def _person(user):
    return {"id": user.id, "name": user.name} if user is not None else None


def _record(kind, row):
    return {"type": kind, "id": row.id, "name": row.name}


def _day_start(day):
    return timezone.make_aware(datetime.combine(day, time.min))


def _rule_review_rows(reader, readable):
    from services.rules.payloads import review_campaign_names, review_payload

    reviews = list(
        readable.select_related(
            "rule__owner", "rule__segment", "rule__organisation", "run"
        ).order_by("created_at", "id")[:LIMIT]
    )
    names = review_campaign_names([r for r in reviews if r.rule.owner_id == reader.id])
    rows = []
    for review in reviews:
        # SOC2:AUTH-02 only the rule's owner decides its review, and only they
        # read the review itself (ReviewListView's rule)
        mine = review.rule.owner_id == reader.id
        rows.append(
            (
                review.created_at,
                {
                    "kind": "rule_review",
                    "id": review.pk,
                    "title": f"{review.get_kind_display()} from {review.rule.name}",
                    "since": review.created_at.isoformat(),
                    "waiting_on": _person(review.rule.owner),
                    "record": None,
                    "can_decide": mine,
                    "detail": {
                        "rule_id": review.rule_id,
                        "rule_name": review.rule.name,
                        "review_kind": review.kind,
                        "counts": review.counts,
                        "review": review_payload(review, names) if mine else None,
                    },
                },
            )
        )
    return rows


def _agent_action_rows(reader, readable, sessions):
    from services.agents import bulk
    from services.agents.payloads import action_payload
    from services.copilot.views import NEUTRAL_TITLE

    actions = list(
        readable.select_related(
            "customer__owner", "account__owner", "session__conversation", "decided_by", "bundle"
        ).order_by("created_at", "id")[:LIMIT]
    )
    rows = []
    # The previews' reads are done once for the page, not once per row.
    with bulk.using(actions):
        payloads = {action.pk: action_payload(action, reader) for action in actions}
        can_decide = {action.pk: may_decide(reader, action) for action in actions}
    for action in actions:
        record = action.record
        session = None
        if action.session_id:
            # SOC2:AUTH-02 a conversation's title is for those who see it whole
            title = (
                action.session.conversation.title
                if action.session_id in sessions
                else NEUTRAL_TITLE
            )
            session = {"id": action.session_id, "title": title}
        kind = "customer" if action.customer_id else "account"
        rows.append(
            (
                action.created_at,
                {
                    "kind": "agent_action",
                    "id": action.pk,
                    "title": action.title,
                    "since": action.created_at.isoformat(),
                    "waiting_on": _person(record.owner) if record is not None else None,
                    "record": _record(kind, record) if record is not None else None,
                    "can_decide": can_decide[action.pk],
                    "detail": {**payloads[action.pk], "session": session},
                },
            )
        )
    return rows


def _question_rows(reader, readable):
    questions = list(
        readable.select_related("assignee", "asked_by", "customer").order_by("created_at", "id")[
            :LIMIT
        ]
    )
    # SOC2:AUTH-02 QuestionAnswerView's rule: the person asked, or manage_users
    answers_any = reader.has_capability("manage_users")
    return [
        (
            q.created_at,
            {
                "kind": "question",
                "id": q.pk,
                "title": q.text[:QUESTION_TITLE],
                "since": q.created_at.isoformat(),
                "waiting_on": _person(q.assignee),
                "record": _record("customer", q.customer) if q.customer_id else None,
                "can_decide": q.assignee_id == reader.id or answers_any,
                "detail": {"asked_by": q.asked_by.name},
            },
        )
        for q in questions
    ]


def _task_rows(readable):
    tasks = list(
        readable.select_related("assignee", "customer", "account").order_by("due_date", "id")[
            :LIMIT
        ]
    )
    return [
        (
            _day_start(t.due_date),
            {
                "kind": "overdue_task",
                "id": t.pk,
                "title": t.title,
                "since": t.due_date.isoformat(),
                "waiting_on": _person(t.assignee),
                "record": (
                    _record("customer", t.customer)
                    if t.customer_id
                    else _record("account", t.account)
                ),
                # A task the reader may read is one they may open.
                "can_decide": True,
                "detail": {"due_date": t.due_date.isoformat(), "priority": t.priority},
            },
        )
        for t in tasks
    ]


def build(reader, scope, today):
    """The scope's waiting items `reader` may open, oldest first and capped
    at LIMIT; `counts` per kind are the full readable totals, and `hidden`
    is how many more wait on the desk about records the reader can't open."""
    from . import desk

    order = {kind: i for i, kind in enumerate(desk.KINDS)}
    sessions = desk.session_ids_seen_whole(reader)
    found = {s.kind: s for s in desk.sources(reader, scope, today, sessions)}
    counts = {kind: found[kind].readable.count() for kind in desk.KINDS}
    hidden = sum(found[kind].waiting.count() for kind in desk.KINDS) - sum(counts.values())
    rows = [
        *_rule_review_rows(reader, found["rule_review"].readable),
        *_agent_action_rows(reader, found["agent_action"].readable, sessions),
        *_question_rows(reader, found["question"].readable),
        *_task_rows(found["overdue_task"].readable),
    ]
    rows.sort(key=lambda row: (row[0], order[row[1]["kind"]], row[1]["id"]))
    return {
        "scope": scope.key,
        "counts": counts,
        "hidden": hidden,
        "items": [item for _at, item in rows[:LIMIT]],
    }
