"""note.create (spec §1.3): a note on the record, in the agent's name
(Decision 16). Undo deletes it while it is as the agent wrote it."""

from rest_framework import serializers

from services.customers.models import Customer, Note
from services.metrics.models import AgentAction
from services.work.clock import today_for

from ..edits import LONG_NOTE_BODY, NO_NOTE_BODY, NO_NOTE_TITLE, checked, text_field
from ..kinds import ALL_AGENTS, AUTO, ChangedSince, Invalid, Kind, Stale

BODY_LIMIT = 4000


def validate(payload, row, ctx, evidence):
    title = str(payload.get("title") or "").strip()[:255]
    body = str(payload.get("body") or "").strip()
    if not title or not body or len(body) > BODY_LIMIT:
        raise Invalid("a note needs a title and a body under 4000 characters")
    return {"title": title, "body": body}


def apply(action, actor, **_):
    record = action.record
    if record is None:
        raise Stale("the record no longer exists")
    parent = {"customer": record} if isinstance(record, Customer) else {"account": record}
    note = Note.objects.create(
        **parent,
        title=action.payload["title"],
        body=action.payload["body"],
        author=None,
        author_name=AgentAction.Agent(action.agent).label,
        # The workspace's own today, not the server's.
        logged_at=today_for(action.organisation),
    )
    return note.pk, {"note_id": note.pk}


def undo(action, actor):
    note = Note.objects.filter(pk=(action.result or {}).get("note_id")).first()
    if note is None:
        return
    if note.title != action.payload["title"] or note.body != action.payload["body"]:
        raise ChangedSince("This note has been edited since.")
    note.delete()


class _NoteEdit(serializers.Serializer):
    title = text_field(255, NO_NOTE_TITLE, "Keep the title under 255 characters.")
    body = text_field(BODY_LIMIT, NO_NOTE_BODY, LONG_NOTE_BODY)


def edit(action, fields, runner):
    clean = checked(_NoteEdit, fields)
    return {**action.payload, **{key: value.strip() for key, value in clean.items()}}


CREATE = Kind(
    key=AgentAction.Kind.NOTE_CREATE,
    label="File a note",
    example="File a note on Taco Bell: two urgent tickets about invoicing this week.",
    max_level=AUTO,
    agents=ALL_AGENTS,
    validate=validate,
    target=lambda payload: f"note:{payload['title'].casefold()}"[:160],
    same=lambda a, b: a["title"].casefold() == b["title"].casefold(),
    current=lambda action: None,
    preview=lambda action: {"note": {"title": action.payload["title"]}},
    apply=apply,
    undo=undo,
    editable=("title", "body"),
    edit=edit,
    outputs=("note_id",),
)
