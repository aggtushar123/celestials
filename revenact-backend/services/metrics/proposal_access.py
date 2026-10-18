"""What a reader may be served of a batch of Proposals — the rule
session/decisions/ and session/close/ (the facilitator's own routes)
apply before handing proposals to whoever can change the session, not
only to the review queue's own view_all_accounts readers.

`evidence` and `rationale` are model-written, and the facilitator builds
its input from the whole organisation's figures (`proposals.build_evidence`)
— an evidence line or a rationale sentence can quote accounts, revenue or
context well beyond what the reader may otherwise see, and there is no way
to filter a sentence account-by-account. So they are withheld from anyone
who doesn't already see everything, exactly as services/brain/desk.py
withholds them on the Me/My team/Company desk (`shows_evidence`).

A task proposal's `action` can additionally *name* a customer the reader
may not open at all (the facilitator picks from the organisation-wide
accounts list, not the reader's book) — unlike evidence, that can't be
redacted in place, so the whole proposal is left out and counted in
`hidden`, mirroring `services.brain.desk`'s own rule for a waiting item
on an account the reader can't open.

Two more fields follow the same "view_all only" line drawn elsewhere:
`initiative` (the linked decision's `{id, title}`) is withheld on every
proposal, matching the Brain
waiting desk, which never serve it to a non-view_all reader either —
a task proposal about a customer this reader can open would otherwise be
the one path that discloses it. `decision_note` is withheld on an
*initiative* proposal only (its decider is always view_all, and the note
can quote organisation-wide figures); a task's note stays, since its
decider can be the customer's own owner.

The facilitator still *stores* every proposal it writes, regardless of who
asked for the capture — they land in the review queue and are decided
there, under `decided_as`'s own permission (services.agents.deciding). This
module only changes what is served to one reader of session/decisions/ or
session/close/.
"""

from services.customers.scoping import sees_everything, visible_customers

from .legacy import LEGACY_KIND, LEGACY_STATUS, legacy_action
from .models import AgentAction


def proposal_payload(proposal):
    """The legacy proposal shape Copilot's session decisions serve."""
    status_value, status_display = LEGACY_STATUS[proposal.status]
    kind = LEGACY_KIND.get(proposal.kind, proposal.kind)
    return {
        "id": proposal.id,
        "batch": proposal.batch,
        "kind": kind,
        "kind_display": "Task on an account" if kind == "task" else "Initiative",
        "title": proposal.title,
        "rationale": proposal.rationale,
        "evidence": proposal.evidence,
        "action": legacy_action(proposal),
        "initiative": (
            {"id": proposal.initiative.id, "title": proposal.initiative.title}
            if proposal.initiative_id
            else None
        ),
        "status": status_value,
        "status_display": status_display,
        "decided_by": proposal.decided_by.name if proposal.decided_by else None,
        "decided_at": proposal.decided_at.isoformat() if proposal.decided_at else None,
        "decision_note": proposal.decision_note,
        "result": proposal.result,
        "generated_by": proposal.generated_by.name if proposal.generated_by else None,
        "source": (
            {
                "session_id": proposal.session.id,
                "conversation_id": proposal.session.conversation_id,
                "title": proposal.session.conversation.title,
            }
            if proposal.session_id
            else None
        ),
        "created_at": proposal.created_at.isoformat(),
    }


def served_proposals(reader, proposals):
    """`(payloads, hidden)` for `reader` reading `proposals` (any iterable
    of AgentAction instances, already `select_related` by the caller as
    `proposal_payload` needs).

    A view_all_accounts reader gets every proposal, payload unchanged,
    `hidden` 0 — the review queue's own shape. Anyone else gets evidence
    `[]`, rationale `None` and `initiative` `None` on every kept proposal
    (plus `decision_note` `None` on an initiative proposal specifically),
    and a task proposal naming a customer they can't open (including one
    that no longer exists) left out and counted.

    One query for the openable customer ids over the whole batch — never
    one per proposal, and never a join+DISTINCT (Postgres 16 plans that
    badly; see services.customers.scoping.visible_customers)."""
    proposals = list(proposals)
    if sees_everything(reader):
        return [proposal_payload(p) for p in proposals], 0

    wanted = {
        p.customer_id for p in proposals if p.kind == AgentAction.Kind.TASK_CREATE and p.customer_id
    }
    # SOC2:AUTH-02 one `id IN (...)` subquery, never a join + DISTINCT
    openable = set(visible_customers(reader).filter(id__in=wanted).values_list("id", flat=True))

    payloads, hidden = [], 0
    for proposal in proposals:
        if proposal.kind == AgentAction.Kind.TASK_CREATE and proposal.customer_id not in openable:
            hidden += 1
            continue
        payload = proposal_payload(proposal)
        # SOC2:AUTH-02 evidence and rationale are written from
        # organisation-wide figures: view_all_accounts readers only
        payload["evidence"] = []
        payload["rationale"] = None
        # SOC2:AUTH-02 a linked initiative is view_all only everywhere else
        # (the Brain waiting desk) —
        # a task proposal about a customer this reader can open must not
        # become the one path that discloses its title
        payload["initiative"] = None
        if proposal.kind == AgentAction.Kind.INITIATIVE_CREATE:
            # SOC2:AUTH-02 an initiative's decider is always view_all
            # (decided_as); the note can quote organisation-wide figures.
            # A task's decider can be its customer's own owner, so its
            # note stays.
            payload["decision_note"] = None
        payloads.append(payload)
    return payloads, hidden
