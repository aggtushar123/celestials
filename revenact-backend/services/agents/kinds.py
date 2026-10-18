"""What every action kind is (Agents round §1.3): its levels, its cap, and
the members each `services.agents.actions` module gives it. The registry
(`registry.py`) collects them; nothing else knows a kind's rules."""

from dataclasses import dataclass
from typing import Callable

from services.metrics.models import AgentAction

AUTO, ASK, NEVER = "auto", "ask", "never"
LEVELS = (AUTO, ASK, NEVER)
#: Lower runs more on its own. A level is allowed when it is at or above a
#: kind's cap: an "ask" cap allows ask and never, not auto.
RANK = {AUTO: 0, ASK: 1, NEVER: 2}
A = AgentAction.Agent
ALL_AGENTS = (A.CS, A.SALES, A.OPS)
RECORD_AGENTS = (A.CS, A.SALES)


class Invalid(Exception):
    """What the model wrote doesn't hold up: dropped at generation."""


class Stale(Exception):
    """The record moved on since the action was proposed: it expires, with
    `reason` as its `expired_reason` (`changed`, or `date_passed` for a date
    that passed while it waited)."""

    def __init__(self, detail="", *, reason="changed"):
        super().__init__(detail)
        self.reason = reason


class ChangedSince(Exception):
    """Undo refused: the thing changed after the action applied."""

    def __init__(self, detail, *, current=None, applied=None):
        super().__init__(detail)
        self.detail = detail
        self.current = current
        self.applied = applied


class OwnerLimit(Exception):
    """The approver already owns the most of one object an action makes: the
    decision is refused (409 OWNER_LIMIT) and the action stays proposed."""

    def __init__(self, detail):
        super().__init__(detail)
        self.detail = detail


class FieldErrors(Exception):
    """A person's edit to a step doesn't hold: `{key: [sentence]}` (contract §9.1)."""

    def __init__(self, errors):
        super().__init__(errors)
        self.errors = errors


class StepFailed(Exception):
    """The step can't finish now (a send refused, say): it fails with
    `detail`, a plain sentence, and keeps what it made so far (`result`), so
    a Retry carries on from there instead of making it again (contract §7)."""

    def __init__(self, detail, *, result=None):
        super().__init__(detail)
        self.detail = detail
        self.result = result


class Skipped(Exception):
    """The step has nothing to do here (Slack escalations D4, SE4-10): it
    ends skipped, not failed, with `note`, a plain sentence the panel shows,
    and keeps `result`. Nothing it did is kept (its savepoint rolls back)."""

    def __init__(self, note, *, result=None):
        super().__init__(note)
        self.note = note
        self.result = result


@dataclass(frozen=True)
class Kind:
    key: str
    label: str
    example: str
    max_level: str
    agents: tuple
    #: (payload, row, ctx, evidence) -> clean payload; raises Invalid.
    validate: Callable
    #: payload -> what one open action is kept per.
    target: Callable
    #: action -> the value now (JSON), or None for a kind that makes a thing.
    current: Callable
    #: action -> the contract's `preview` dict.
    preview: Callable
    #: (action, actor, **overrides) -> (after, result); raises Stale.
    apply: Callable
    #: (action, actor) -> None; raises ChangedSince.
    undo: Callable
    workspace_level: bool = False
    #: (payload, payload) -> bool: the same proposal again, for the one-open
    #: rule. None means the payloads are equal.
    same: Callable | None = None
    #: (action, current) -> bool: whether what the action set is still what
    #: `current` reads, for undo's read-time hint. None means
    #: `current == action.after`.
    unchanged: Callable | None = None
    #: True for the builder kinds (segment, scenario, campaign, map, plan
    #: template): at most one of them is kept per pass.
    builder: bool = False
    #: True when `preview` is (action, reader) -> dict: a count the reader's
    #: own rules decide (a segment's members, a record's people).
    per_reader: bool = False
    #: payload -> every free-text string it carries, for the naming rules.
    #: None means the payload's `title`, `body` and `reason`.
    texts: Callable | None = None
    #: Can't be undone once it ran (contract §3).
    irreversible: bool = False
    #: Acts outside Revenact: always irreversible and always Ask (D21).
    outside: bool = False
    #: The payload keys a person may change in the bundle panel (D11).
    editable: tuple = ()
    #: (action, fields, runner) -> the new payload; raises FieldErrors.
    edit: Callable | None = None
    #: payload -> values the panel's `fields` reads for editable keys a
    #: payload doesn't hold yet (an older step). None means none.
    field_defaults: Callable | None = None
    #: The `outputs` keys a run of this kind fills (contract §6.2).
    outputs: tuple = ()
    #: The payload keys whose text reaches a customer: a `{{step N.key}}`
    #: there is refused at proposal time (contract §6.1).
    customer_facing: tuple = ()
    #: (payload, *, live=False) -> the placeholder keys a customer-facing
    #: field may still carry (SE4-6); `live` re-reads what may have changed
    #: since the proposal. None: none, as for every kind but slack.reply.
    open_keys: Callable | None = None
    #: What Undo answers for a step that ran irreversibly (contract §3).
    cant_undo: str = ""
    #: Slack bundles (owner, 2026-10-17): offered only by the Slack message
    #: proposer (`slack_bundles`), never on the nightly pass or a thread's read.
    message_only: bool = False
    #: payload -> the keys a person may change for this payload, in place of
    #: `editable` (a reply to a Slack message keeps its channel). None: `editable`.
    editable_for: Callable | None = None
    #: payload -> True when a run of this payload can still be undone though
    #: the kind is `irreversible` (a survey held back for a Jira issue).
    undoable_for: Callable | None = None
    #: Guided agent (2026-10-18): a `message_only` kind a thread's read may
    #: offer too (never the nightly pass).
    on_threads: bool = False
    #: action -> False when an applied run left nothing to undo (a diagnosis
    #: that filed no note): no undo is shown for it. None: every run has one.
    undoable_run: Callable | None = None
    #: (step, reader, values) -> the panel's field values for `reader`, or
    #: None when they may neither see nor change them (a draft in someone
    #: else's mailbox). None means `values` as they are.
    fields_for: Callable | None = None
