"""A record carrying one open action of each non-task-create kind the page
previews look things up for (record.owner, task.reassign, record.attribute),
for the bounded-query tests: adding more of them must add no query."""

from datetime import timedelta

from services.attributes.models import AIAttribute
from services.customers.models import Task
from services.metrics.models import AgentAction


def add_mixed_actions(fixture, number, *, owner=None):
    """A fresh customer of `owner` (default Carl) with three actions on it."""
    owner = owner or fixture.csm
    record = fixture.customer(f"Mixed {number}", owner, 10_000, "5.0")
    attribute = AIAttribute.objects.get_or_create(
        organisation=fixture.org,
        api_name="mixed_score",
        defaults={"name": "Mixed score", "prompt": "p", "value_type": "number"},
    )[0]
    task = Task.objects.create(
        customer=record,
        title=f"Call {number}",
        assignee=owner,
        assignee_name=owner.name,
        created_by=owner,
        due_date=fixture.today + timedelta(days=3),
    )
    common = {
        "organisation": fixture.org,
        "agent": "cs",
        "batch": "b",
        "customer": record,
        "title": "t",
        "rationale": "r",
        "evidence": ["e"],
    }
    made = [
        AgentAction.objects.create(
            **common,
            kind="record.owner",
            target="owner",
            payload={"owner_id": fixture.mona.pk},
            before=owner.pk,
        ),
        AgentAction.objects.create(
            **common,
            kind="task.reassign",
            target=f"task:{task.pk}:assignee",
            payload={"task_id": task.pk, "assignee_id": fixture.mona.pk},
            before=owner.pk,
        ),
        AgentAction.objects.create(
            **common,
            kind="record.attribute",
            target=f"attribute:{attribute.pk}",
            payload={"attribute_id": attribute.pk, "value": 5},
        ),
    ]
    return record, made


def add_draft_and_plan_actions(fixture, number, *, owner=None):
    """A fresh organisation of `owner` (default Carl) with an applied email
    draft (its ReplyDraft made), a proposed ticket draft and a proposed
    plan.start: the new kinds' preview and undo reads."""
    from services.agents.actions import drafts
    from services.agents.tests.drafts_fixtures import draft_action, inbound, mailbox, ticket
    from services.mail.models import MailboxConnection
    from services.plans.models import PlanTemplate

    owner = owner or fixture.csm
    if not MailboxConnection.objects.filter(user=owner).exists():
        mailbox(owner)
    record = fixture.customer(f"Drafted {number}", owner, 10_000, "5.0")
    mail = inbound(record, owner, thread=f"mixed-{number}", message_id=f"<mixed{number}@x.com>")
    email_action = draft_action(fixture.org, mail, status="applied")
    email_action.after, email_action.result = drafts.REPLY.apply(email_action, owner)
    email_action.save(update_fields=["after", "result"])
    ticket_action = draft_action(fixture.org, ticket(record, number=f"TKT-{number}"))
    onboarding = PlanTemplate.objects.get(is_builtin=True, kind="onboarding")
    plan_action = AgentAction.objects.create(
        organisation=fixture.org,
        agent="cs",
        batch="b",
        kind="plan.start",
        customer=record,
        target=f"plan:{onboarding.pk}",
        title="Start onboarding",
        rationale="r",
        payload={
            "template_id": onboarding.pk,
            "template": onboarding.name,
            "milestones": 3,
            "tasks": 9,
        },
    )
    return record, [email_action, ticket_action, plan_action]
