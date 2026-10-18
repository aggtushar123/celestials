"""Meeting proposals waiting on the reader, as rows of Work's suggested group."""

from services.work.feed_shape import after_q, item, record_ref

from .models import MeetingProposal

MEETING_PROPOSAL = "meeting_proposal"
FROM = {"type": "email_agent", "label": "From an email"}
ORDER = ("created_at", "id")


def proposal_item(proposal, *, may_open=True):
    # SOC2:AUTH-02 the twice-filter: a record is named only while the reader may open it
    record = (proposal.customer or proposal.account) if may_open else None
    return item(
        key=f"{MEETING_PROPOSAL}:{proposal.pk}",
        kind=MEETING_PROPOSAL,
        pk=proposal.pk,
        title=proposal.topic,
        record=record_ref(record) if record is not None else None,
        source=FROM,
        at=proposal.created_at,
        private=True,
        actions=["book", "dismiss"],
        detail=meeting_detail(proposal),
    )


def meeting_detail(proposal):
    # SOC2:AUTH-02 owner decision 5: topic, who asked, who comes, when — never the email
    return {
        "requester": {"id": proposal.requester_id, "name": proposal.requester.name}
        if proposal.requester_id
        else None,
        "attendees": [{"id": u.pk, "name": u.name} for u in proposal.attendees.all()],
        "without_calendar": [{"id": u.pk, "name": u.name} for u in proposal.unknown_free.all()],
        "proposed_start": proposal.proposed_start,
        "length_minutes": proposal.length_minutes,
        "urgent": proposal.urgent,
    }


class MeetingProposals:
    kind = MEETING_PROPOSAL

    def __init__(self, reader):
        self.reader = reader
        # SOC2:AUTH-02 the approver's alone
        self.rows = MeetingProposal.objects.filter(
            approver_id=reader.pk,
            organisation_id=reader.organisation_id,
            status=MeetingProposal.Status.OPEN,
        )

    def count(self):
        return self.rows.count()

    def page(self, after, limit):
        rows = self.rows.select_related("requester", "customer", "account").prefetch_related(
            "attendees", "unknown_free"
        )
        if after is not None:
            rows = rows.filter(after_q(ORDER, after, descending=True))
        found = list(rows.order_by("-created_at", "-id")[:limit])
        from services.customers.scoping import can_open

        return [
            (
                (p.created_at, p.pk),
                proposal_item(
                    p,
                    may_open=(p.customer or p.account) is None
                    or can_open(self.reader, p.customer or p.account),
                ),
            )
            for p in found
        ]


EMAIL_SUGGESTION = "email_suggestion"
OWN = {"type": "email_agent", "label": "From your email"}


def suggestion_item(intent, *, may_open=True):
    """What the agent read in the reader's own sent mail, waiting on their
    yes (decision B): a task to give, or a meeting to ask for."""
    record = intent.record if may_open else None
    proposal = getattr(intent, "proposal", None)
    if intent.kind == "task":
        detail = {
            "kind": "task",
            "assignee": {"id": intent.assignee_id, "name": intent.assignee.name}
            if intent.assignee_id
            else None,
            "task_title": intent.task_title,
            "due_date": intent.due_date,
            "urgent": intent.urgent,
        }
        who = intent.assignee.name if intent.assignee_id else "them"
        title = f"Give {who} a task: {intent.task_title}"
    else:
        detail = {"kind": "meeting", **(meeting_detail(proposal) if proposal else {})}
        detail["approver"] = (
            {"id": proposal.approver_id, "name": proposal.approver.name} if proposal else None
        )
        who = proposal.approver.name if proposal else "them"
        title = f"Ask {who} for a meeting: {intent.topic}"
    return item(
        key=f"{EMAIL_SUGGESTION}:{intent.pk}",
        kind=EMAIL_SUGGESTION,
        pk=intent.pk,
        title=title,
        record=record_ref(record) if record is not None else None,
        source=OWN,
        at=intent.created_at,
        private=True,
        actions=["confirm", "dismiss"],
        detail=detail,
    )


class SenderSuggestions:
    kind = EMAIL_SUGGESTION

    def __init__(self, reader):
        from .run import waiting_on

        self.reader = reader
        self.rows = waiting_on(reader)

    def count(self):
        return self.rows.count()

    def page(self, after, limit):
        from services.customers.scoping import can_open

        rows = self.rows.select_related(
            "assignee", "customer", "account", "proposal__approver", "proposal__requester"
        ).prefetch_related("proposal__attendees", "proposal__unknown_free")
        if after is not None:
            rows = rows.filter(after_q(ORDER, after, descending=True))
        found = list(rows.order_by("-created_at", "-id")[:limit])
        return [
            (
                (i.created_at, i.pk),
                suggestion_item(i, may_open=i.record is None or can_open(self.reader, i.record)),
            )
            for i in found
        ]
