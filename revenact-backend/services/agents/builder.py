"""What the builder kinds share (Agents delivery 3, contract
`2026-10-08-agents-builder-api.md`): a segment definition checked when the
agent writes it and again as the approver, created as theirs, counted per
reader, and released by undo while nothing else uses it."""

from types import SimpleNamespace

from django.db.models import Count, Q
from django.utils import timezone

from core import audit
from services.accounts.models import User
from services.customers.scoping import SystemActor
from services.segments import registry
from services.segments.baseline import rebaseline
from services.segments.compiler import Compiler
from services.segments.evaluate import visible_records
from services.segments.models import MAX_OWNED as SEGMENT_LIMIT
from services.segments.models import Segment
from services.segments.rules import RuleError, leaves, validate_rules
from services.segments.serializers import SegmentWriteSerializer

from . import bulk
from .kinds import Invalid, OwnerLimit, Stale

NAME_LIMIT = 120
DESCRIPTION_LIMIT = 500
#: Most top-level conditions (a leaf or a group each) an agent's segment holds.
CONDITION_LIMIT = 8
KINDS = tuple(Segment.Kind.values)


class WorkspaceWriter(SystemActor):
    """The workspace as a rule's writer when the agent writes it: it opens
    every record, as the view-all reader who decides a builder action does.
    The approver's own check at apply is the one that counts."""

    def __init__(self, organisation):
        super().__init__(organisation)
        self.organisation_id = organisation.pk


def text(value, limit, *, required=True):
    """`value` trimmed; Invalid when it is not text, empty when required,
    or longer than `limit`."""
    if value is None and not required:
        return ""
    if not isinstance(value, str):
        raise Invalid("not text")
    value = value.strip()
    if (required and not value) or len(value) > limit:
        raise Invalid("text missing or too long")
    return value


def check_definition(raw, ctx):
    """A segment definition as the agent wrote it, checked: its kind, name,
    why, one to eight conditions, and the segment rules as the workspace
    writes them (`validate_rules`)."""
    if not isinstance(raw, dict):
        raise Invalid("a segment definition is an object")
    kind = raw.get("kind")
    if kind not in KINDS:
        raise Invalid("choose customer, account or contact")
    rules = raw.get("rules")
    conditions = rules.get("conditions") if isinstance(rules, dict) else None
    if not isinstance(conditions, list) or not 1 <= len(conditions) <= CONDITION_LIMIT:
        raise Invalid("one to eight conditions")
    try:
        clean = validate_rules(rules, kind, user=WorkspaceWriter(ctx.organisation))
    except (RuleError, KeyError, TypeError, AttributeError) as exc:
        raise Invalid("the segment rules don't hold") from exc
    return {
        "kind": kind,
        "name": text(raw.get("name"), NAME_LIMIT),
        "description": text(raw.get("description"), DESCRIPTION_LIMIT, required=False),
        "rules": clean,
    }


def definition_texts(definition):
    """A definition's free text, for the naming rules."""
    return [definition.get("name"), definition.get("description")]


def member_counts(reader, definitions, *, today):
    """Each definition's members as `reader` sees them: its rules over the
    reader's own book, as `members.preview` counts an unsaved segment. One
    COUNT per segment kind, each definition an `id IN` subquery, so no join
    and no DISTINCT; the definitions share one attribute read."""
    counts = [0] * len(definitions)
    by_kind = {}
    for index, definition in enumerate(definitions):
        by_kind.setdefault(definition["kind"], []).append(index)
    keys = [c.get("field", "") for d in definitions for c in leaves(d["rules"])]
    cache = {"attributes": registry.attributes_for(reader.organisation_id, keys)}
    for kind, indexes in by_kind.items():
        counted = {}
        for index in indexes:
            compiler = Compiler(kind, user=reader, today=today, cache=cache)
            compiled = compiler.compile(definitions[index]["rules"])
            matched = compiled.apply(visible_records(kind, reader)).values("pk")
            counted[f"n{index}"] = Count("pk", filter=Q(pk__in=matched))
        # SOC2:AUTH-02 counted over the records the reader may open, never named
        row = visible_records(kind, reader).aggregate(**counted)
        for index in indexes:
            counts[index] = row[f"n{index}"]
    return counts


RECORD_NOUNS = {"customer": "organisations", "account": "accounts", "contact": "contacts"}


def audience_counts(reader, definition, roles, *, today):
    """Who a survey or campaign on `definition` would reach, as `reader` sees
    it (contract §7.1): the matching records they may open, and those
    records' contacts with a chosen role and an email. `id IN` subqueries."""
    from services.surveys.audience import reach

    kind = definition["kind"]
    keys = [c.get("field", "") for c in leaves(definition["rules"])]
    cache = {"attributes": registry.attributes_for(reader.organisation_id, keys)}
    compiled = Compiler(kind, user=reader, today=today, cache=cache).compile(definition["rules"])
    # SOC2:AUTH-02 counted over the records the reader may open, never named
    members = compiled.apply(visible_records(kind, reader))
    people, _hidden, _capped = reach(kind, roles, reader, members)
    return {
        "contacts": sum(1 for person in people if person.email.strip()),
        "records": members.count(),
        "record_noun": RECORD_NOUNS[kind],
    }


def members_for(reader, action):
    """A segment.create action's member count for `reader`."""
    page = bulk.active()
    if page is not None:
        found = page.member_count(reader, action.pk)
        if found is not None:
            return found
    return member_counts(reader, [action.payload], today=timezone.localdate())[0]


def as_request(user):
    """What the write serializers read from a request: `user` only."""
    return SimpleNamespace(user=user)


def lock_owner(user):
    """The owner's row, locked: two creates for one owner queue here, as each
    create view's own 50-per-owner check does."""
    list(User.objects.select_for_update().filter(pk=user.pk).values_list("pk", flat=True))


def check_owner_limit(owned, maximum, noun):
    """OwnerLimit, in the contract's words, when `owned` is at `maximum`.
    Call after `lock_owner`."""
    if owned.count() >= maximum:
        raise OwnerLimit(f"You already own {maximum} {noun}.")


def refusal_detail(body):
    """A send refusal's one sentence (contract §9.3): its `detail`, else its
    first field error."""
    value = body.get("detail") or next(iter(body.values()), "")
    return str(value[0] if isinstance(value, list) and value else value)


def stamp(model, pk):
    """The row's stored `updated_at`, for undo's "edited since"."""
    value = model.objects.filter(pk=pk).values_list("updated_at", flat=True).first()
    return None if value is None else value.isoformat()


def create_segment(action, definition, approver):
    """A private segment owned by `approver`, its rules checked again as
    them (`SegmentWriteSerializer`), its baseline set, audited with them as
    actor. Stale when it no longer holds for them; OwnerLimit past 50."""
    data = {
        "name": definition["name"],
        "description": definition["description"],
        "kind": definition["kind"],
        "rules": definition["rules"],
        "sharing": Segment.Sharing.PRIVATE,
    }
    # SOC2:AUTH-02 the rules may name only what the approver may open
    serializer = SegmentWriteSerializer(data=data, context={"request": as_request(approver)})
    if not serializer.is_valid():
        raise Stale("the segment no longer holds for the approver")
    lock_owner(approver)
    check_owner_limit(Segment.objects.filter(owner=approver), SEGMENT_LIMIT, "segments")
    segment = serializer.save(
        owner=approver, organisation_id=action.organisation_id, agent_action=action
    )
    rebaseline(segment, today=timezone.localdate())
    audit.record(  # SOC2:LOG-01
        "segment.created",
        actor=approver,
        organisation=action.organisation,
        target=segment,
        metadata={"kind": segment.kind, "agent_action": action.pk},
    )
    return segment


def locked_segment(pk):
    """The segment under the nightly step's row lock, or None."""
    return (
        Segment.objects.select_for_update(of=("self",)).defer("last_members").filter(pk=pk).first()
    )


def segment_in_use(segment):
    """Whether a rule, a campaign or a survey send uses `segment`."""
    return (
        segment.triggered_rules.exists()
        or segment.campaigns.exists()
        or segment.survey_sends.exists()
    )


def delete_segment(segment, action, actor):
    audit.record(  # SOC2:LOG-01
        "segment.deleted",
        actor=actor,
        organisation=action.organisation,
        target=segment,
        metadata={"kind": segment.kind},
    )
    segment.delete()


def release_segment(action, segment_id, updated_at, actor):
    """Undo's second half for a scenario or campaign: its segment goes too
    while it is unedited and nothing else uses it (a shared segment survives).
    True when it was deleted."""
    segment = locked_segment(segment_id)
    if segment is None or segment.updated_at.isoformat() != updated_at:
        return False
    if segment_in_use(segment):
        return False
    delete_segment(segment, action, actor)
    return True
