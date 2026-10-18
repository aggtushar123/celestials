"""How one record reads in the story: the contract's item.

`title` and `summary` are built from the row's own fields; the row has
already passed its record rule (`sources.py`), so its text may be shown to
this viewer. `summary` is one line: whitespace flattened, cut at a word.
`actor` is a user when the row links one, else the name the row stores.
`source` is where the record came from: a connector's or mailbox's provider,
or `revenact` for anything logged in the app. `link.url` is returned only
for `http(s)` URLs, because synced and typed URLs land in an `href`.
"""

from services.customers.conversation_links import record_of
from services.customers.models import Email, Survey

from .sources import SOURCES

SUMMARY_CHARS = 240
REVENACT = "revenact"


def clip(text, limit=SUMMARY_CHARS) -> str:
    flat = " ".join((text or "").split())
    if len(flat) <= limit:
        return flat
    head = flat[: limit - 1]
    if " " in head:
        head = head.rsplit(" ", 1)[0]
    return head + "…"


def person(user=None, name=""):
    if user is not None:
        return {"id": user.pk, "name": user.name}
    name = (name or "").strip()
    return {"id": None, "name": name} if name else None


def safe_url(raw):
    raw = raw or ""
    return raw if raw.lower().startswith(("https://", "http://")) else None


def make_item(
    scope,
    *,
    ident,
    kind,
    at,
    all_day,
    account_id,
    title,
    summary="",
    actor=None,
    source=REVENACT,
    thread_id="",
    url="",
    extra=None,
):
    item = {
        "id": ident,
        "kind": kind,
        "source": source,
        "occurred_at": at.isoformat(),
        "all_day": all_day,
        "account": scope.account_ref(account_id),
        "title": title,
        "summary": summary,
        "actor": actor,
        "link": {"thread_id": thread_id or None, "url": safe_url(url)},
    }
    item.update(extra or {})
    return item


def _origin(connector):
    return connector.provider if connector is not None else REVENACT


def _activity(row):
    return {"title": row.get_type_display()}


def _calendar_event(row):
    parts = [row.get_type_display(), f"{row.start_time:%H:%M}–{row.end_time:%H:%M}"]
    if row.attendee_count:
        noun = "attendee" if row.attendee_count == 1 else "attendees"
        parts.append(f"{row.attendee_count} {noun}")
    if row.description.strip():
        parts.append(row.description)
    return {"title": row.title, "summary": clip(" · ".join(parts))}


def _call(row):
    return {
        "title": row.title,
        "summary": clip(row.summary),
        "actor": person(name=row.host_name),
        "source": _origin(row.connector),
        "url": row.recording_url,
    }


def _email(row):
    sent_by_owner = row.mailbox_owner_id is not None and row.direction == Email.Direction.SENT
    return {
        "title": row.subject,
        "summary": clip(row.body),
        "actor": person(row.mailbox_owner) if sent_by_owner else person(name=row.sender_name),
        "source": row.mailbox.provider if row.mailbox_id else REVENACT,
        "thread_id": row.thread_id,
    }


def _note(row):
    return {
        "title": row.title,
        "summary": clip(row.body),
        "actor": person(row.author, row.author_name),
    }


def _survey(row):
    if row.status == Survey.Status.RESPONDED:
        summary = "Responded" if row.score is None else f"Responded · score {row.score}"
    elif row.status == Survey.Status.EXPIRED:
        summary = "Expired without a response"
    else:
        summary = "Sent · awaiting a response"
    return {"title": f"{row.get_survey_type_display()} survey", "summary": summary}


def _ref(row):
    return {"id": row.pk, "name": row.name} if row is not None else None


def _task(row):
    return {
        "title": row.title,
        "summary": " · ".join(
            [
                f"Due {row.due_date.isoformat()}",
                row.get_priority_display(),
                row.get_status_display(),
            ]
        ),
        "actor": person(row.assignee, row.assignee_name),
        "extra": {"plan": _ref(row.plan), "milestone": _ref(row.milestone)},
    }


def _ticket(row):
    return {
        "title": row.title,
        "summary": " · ".join(
            [row.ticket_number, row.get_priority_display(), row.get_status_display()]
        ),
        "actor": person(name=row.requester_name),
        "source": _origin(row.connector),
        "url": row.external_url,
        # SE4-17: read by conversation_links.attach, which drops them
        "extra": {"_conversation": row.conversation, "_record": record_of(row)},
    }


def _slack(row):
    from services.connectors.slack_text import named

    replies = max(len(row.messages or []) - 1, 0)
    parts = [f"#{row.channel_name}" if row.channel_name else "Slack"]
    if replies:
        parts.append("1 reply" if replies == 1 else f"{replies} replies")
    return {
        # CC-14: a mention reads as the person it names
        "title": named(row.title, row.people),
        "summary": " · ".join(parts),
        "actor": person(row.started_by, row.started_by_name),
        "source": "slack",
        "url": row.url,
        # SE4-17: `_record` is read by conversation_links.attach, which drops it
        "extra": {"replies": replies, "_record": record_of(row)},
    }


_FIELDS = {
    "activity": _activity,
    "calendar_event": _calendar_event,
    "call": _call,
    "email": _email,
    "note": _note,
    "slack": _slack,
    "survey": _survey,
    "task": _task,
    "ticket": _ticket,
}


def render(kind, row, scope):
    return make_item(
        scope,
        ident=row.pk,
        kind=kind,
        at=row._at,
        all_day=SOURCES[kind].all_day,
        account_id=row.account_id,
        **_FIELDS[kind](row),
    )
