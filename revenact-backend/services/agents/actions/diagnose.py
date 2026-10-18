"""record.diagnose ("Diagnose", guided agent spec §2.1): read what is known
about the bundle's record as its runner may read it and say what is wrong,
with findings that point at their sources. It changes nothing in the book
but one note: the diagnosis filed on the record in the runner's name, which
undo deletes while it is unchanged. A diagnosis resting on the runner's
private mail files only its findings from shareable sources, without the
summary, and no note when none is left. Never irreversible. Offered only by
the message proposers (a thread's read, a Slack message), never the nightly
pass."""

import logging
import uuid

from django.db import transaction

from core import audit
from services.copilot.anthropic_client import (
    BudgetExceeded,
    CopilotNotConfigured,
    CopilotRequestFailed,
)
from services.customers.models import Customer, Note
from services.customers.personal import visible_notes
from services.customers.scoping import can_open
from services.metrics.models import AgentAction
from services.work.clock import today_for

from .. import diagnosis
from ..kinds import ASK, RECORD_AGENTS, ChangedSince, Invalid, Kind, Stale, StepFailed

logger = logging.getLogger(__name__)
S = AgentAction.Status
NOTHING_TO_UNDO = "This diagnosis filed no note, so there is nothing to undo."
NOTE_EDITED = "This note has been edited since."
CANT_OPEN = "You can no longer open this record."
NO_CREDITS = "The workspace has no AI credits left."
COULDNT = "Couldn't diagnose this just now. Retry it."
READS = ["health", "tickets", "calls", "emails", "slack", "contacts"]
#: What a note may cite when the diagnosis read the runner's private mail:
#: never a contact (its last reply may come from that mail).
SHAREABLE = ("ticket", "call", "health", "email", "slack")


def new_key():
    return uuid.uuid4().hex[:16]


def validate(payload, row, ctx, evidence):
    # Only a message bundle's read offers it: its thread, or a Slack message.
    if ctx.thread_ref is None and ctx.slack_message is None:
        raise Invalid("only a message bundle diagnoses")
    if row["kind"] not in ("customer", "account"):
        raise Invalid("a record is diagnosed")
    # One per message: never a twin of another bundle's step (the trio stays whole).
    return {"key": new_key()}


def target(payload):
    return f"diagnose:{payload['key']}"


def _shown(action, reader, result):
    """The findings `reader` may see: their own run's, or those whose source
    they may open themselves (the twice filter, again per reader)."""
    record = action.record
    own = result.get("ran_by") == reader.pk
    out = []
    for finding in result.get("findings") or []:
        source = finding.get("source") or {}
        kind, ref = source.get("kind"), source.get("ref")
        # SOC2:AUTH-02 a finding is shown only to a reader who may open its source
        if not own and not diagnosis.may_open(reader, record, kind, ref):
            continue
        out.append(
            {
                "text": finding.get("text", ""),
                "source": {
                    "kind": kind,
                    "label": source.get("label", ""),
                    "url": source.get("url"),
                },
            }
        )
    return out


def _note_of(action):
    note = (action.result or {}).get("filed_note") if isinstance(action.result, dict) else None
    return note if isinstance(note, dict) else None


def _note_shown(action, reader):
    """The filed note's id and title, for a reader who may read the note."""
    note = _note_of(action)
    if note is None or action.status != S.APPLIED:
        return None
    # SOC2:AUTH-02 a note is its author's and their chain's (visible_notes)
    if not visible_notes(reader, Note.objects.filter(pk=note.get("id"))).exists():
        return None
    return {"id": note["id"], "title": note.get("title", "")}


def preview(action, reader):
    record = action.record
    name = record.name if record is not None else ""
    result = action.result if isinstance(action.result, dict) else {}
    if action.status in (S.APPLIED, S.UNDONE) and result.get("summary"):
        own = result.get("ran_by") == reader.pk
        hidden = bool(result.get("private")) and not own
        return {
            "diagnose": {
                "record": name,
                "reads": READS,
                "counts": result.get("counts") or {},
                # SOC2:AUTH-02 a summary written from the runner's private mail is theirs alone
                "summary": "" if hidden else result["summary"],
                "summary_hidden": hidden,
                "findings": _shown(action, reader, result),
                "note": _note_shown(action, reader),
            }
        }
    return {
        "diagnose": {
            "record": name,
            "reads": READS,
            "counts": diagnosis.counts(record, reader) if record is not None else {},
            "summary": None,
            "summary_hidden": False,
            "findings": [],
            "note": None,
        }
    }


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person runs a diagnosis")
    record = action.record
    if record is None:
        raise Stale("the record is gone")
    # SOC2:AUTH-02 everything is read as the runner, on a record they may open
    if not can_open(actor, record):
        raise StepFailed(CANT_OPEN)
    found = diagnosis.gather(record, actor, action.bundle)
    try:
        summary, findings = diagnosis.diagnose(action.organisation, actor, action.agent, found)
    except BudgetExceeded:
        raise StepFailed(NO_CREDITS) from None
    except (CopilotNotConfigured, CopilotRequestFailed, ValueError) as exc:
        logger.info("diagnose %s: no answer: %s", action.pk, type(exc).__name__)
        raise StepFailed(COULDNT) from None
    rows = [
        {
            "text": text,
            "source": {
                "kind": source.kind,
                "ref": source.ref,
                "label": source.label,
                "url": source.url,
            },
        }
        for text, source in findings
    ]
    with transaction.atomic():
        note = _file_note(action, actor, record, summary, findings, found.private)
        audit.record(  # SOC2:LOG-01 counts and ids only: never the summary or a finding's text
            "agent_diagnose.ran",
            actor=actor,
            organisation=action.organisation,
            target=action,
            target_repr=f"Action {action.pk}",
            metadata={
                "agent_step": action.pk,
                "bundle": action.bundle_id,
                "findings": len(rows),
                "counts": found.counts,
                "private": found.private,
                "note": note.pk if note is not None else None,
            },
        )
    filed = None if note is None else {"id": note.pk, "title": note.title, "body": note.body}
    return {"diagnosed": True, "note_id": filed["id"] if filed else None}, {
        "ran_by": actor.pk,
        "summary": summary,
        "findings": rows,
        "counts": found.counts,
        "private": found.private,
        "filed_note": filed,
    }


def note_text(record, summary, findings, private):
    """(title, body) of the diagnosis note, or None when nothing may go in it.
    Findings are the finding's text and its source's label, never a link."""
    if private:
        # SOC2:AUTH-02 nothing derived from the runner's private mail: no summary,
        # only findings citing sources others may read
        summary = ""
        findings = [
            (text, source)
            for text, source in findings
            if source.kind in SHAREABLE and not source.private
        ]
    if not findings:
        return None
    lines = [summary, ""] if summary else []
    lines.append("Findings:")
    lines += [f"- {text} ({source.label})" for text, source in findings]
    return f"Diagnosis: {record.name}"[:255], "\n".join(lines)


def _file_note(action, actor, record, summary, findings, private):
    text = note_text(record, summary, findings, private)
    if text is None:
        return None
    parent = {"customer": record} if isinstance(record, Customer) else {"account": record}
    return Note.objects.create(
        **parent,
        title=text[0],
        body=text[1],
        author=actor,
        author_name=actor.name[:150],
        logged_at=today_for(action.organisation),
    )


def _current(action):
    note = _note_of(action)
    if note is None:
        return None
    return Note.objects.filter(pk=note.get("id")).values("title", "body").first()


def _unchanged(action, current):
    note = _note_of(action) or {}
    return current == {"title": note.get("title"), "body": note.get("body")}


def undo(action, actor):
    filed = _note_of(action)
    if filed is None:
        raise ChangedSince(NOTHING_TO_UNDO)
    note = Note.objects.select_for_update().filter(pk=filed.get("id")).first()
    if note is None:
        return
    if note.title != filed.get("title") or note.body != filed.get("body"):
        raise ChangedSince(NOTE_EDITED)
    note.delete()


DIAGNOSE = Kind(
    key=AgentAction.Kind.RECORD_DIAGNOSE,
    label="Diagnose",
    example="Diagnose why Twilio is unhappy",
    max_level=ASK,
    agents=RECORD_AGENTS,
    validate=validate,
    target=target,
    current=_current,
    unchanged=_unchanged,
    preview=preview,
    apply=apply,
    undo=undo,
    per_reader=True,
    texts=lambda payload: [],
    message_only=True,
    on_threads=True,
    undoable_run=lambda action: _note_of(action) is not None,
)
