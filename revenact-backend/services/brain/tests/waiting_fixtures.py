"""Waiting on you: BrainFixture's people and book, plus makers for the
four kinds of waiting item. Carl (CSM) reports to Mona; Dana is nobody's;
Alice has view_all_accounts; Lee reads Company through Leadership only."""

import uuid
from datetime import timedelta

from django.utils import timezone

from services.brain.tests.fixtures import BrainFixture
from services.copilot.models import (
    Conversation,
    CopilotSession,
    SessionInvite,
    SessionParticipant,
)
from services.customers.models import Task
from services.knowledge.models import Question
from services.metrics.models import AgentAction
from services.metrics.proposals import LEGACY_KINDS
from services.rules.models import Rule, RuleReview, RuleRun
from services.rules.tests.fixtures import SURVEY

# A task action whose customer is "gone". The FK cascades, so deleting a
# customer deletes its actions: a `customer=None` task action is only ever a
# migrated row (0011 keeps such a decided one and expires a waiting one).
# `proposal(customer_id=GONE)` builds that.
GONE = 999_999


class WaitingFixture(BrainFixture):
    def proposal(self, customer=None, *, kind="task", session=None, title="Save play", **extra):
        """A waiting proposal. A task names `customer`; an initiative names a
        metric. (`kind` keeps the old words; the row stores the new ones.)"""
        kind = LEGACY_KINDS.get(kind, kind)
        fields = {}
        if kind == AgentAction.Kind.TASK_CREATE:
            fields = {
                "customer": customer,
                "target": f"task:{title.casefold()}:{uuid.uuid4().hex}",
            }
            action = {
                "title": title,
                "assignee_id": None,
                "assignee_name": "Carl CSM",
                "due_date": (self.today + timedelta(days=7)).isoformat(),
                "priority": "high",
            }
        else:
            action = {
                "metric": "at_risk_arr",
                "metric_label": "ARR at risk",
                "dimension": "",
                "member": "",
                "member_label": "",
                "target_value": 1000.0,
                "target_by": (self.today + timedelta(days=60)).isoformat(),
            }
        return AgentAction.objects.create(
            organisation=self.org,
            batch="b1",
            kind=kind,
            title=title,
            rationale="Because the figures say so.",
            evidence=["Pizza Hut: USD 300,000"],
            payload=action,
            session=session,
            **fields,
        )

    def session(self, owner, *members, title="What do we do about Pizza Hut?"):
        """A live session `owner` started; each member accepted the owner's
        invite and is present."""
        conversation = Conversation.objects.create(organisation=self.org, user=owner, title=title)
        session = CopilotSession.objects.create(
            conversation=conversation, status=CopilotSession.Status.LIVE
        )
        SessionParticipant.objects.create(session=session, user=owner)
        for member in members:
            SessionInvite.objects.create(
                session=session,
                invited_user=member,
                invited_by=owner,
                status=SessionInvite.Status.ACCEPTED,
            )
            SessionParticipant.objects.create(session=session, user=member)
        return session

    def review(
        self, owner, *, name="Detractor follow-up", kind="survey", sharing="private", counts=None
    ):
        """A waiting rule review on a fresh rule of `owner`'s."""
        rule = Rule.objects.create(
            organisation=self.org, owner=owner, name=name, trigger="entered", sharing=sharing
        )
        run = RuleRun.objects.create(rule=rule, run_on=self.today, started_at=timezone.now())
        action = SURVEY if kind == "survey" else {"action": "campaign", "campaign": 1}
        return RuleReview.objects.create(
            rule=rule,
            run=run,
            kind=kind,
            action=action,
            records=[],
            counts=counts if counts is not None else {"people": 12, "records": 3},
        )

    def question(self, assignee, *, customer=None, asked_by=None, text="Who signs off renewals?"):
        return Question.objects.create(
            organisation=self.org,
            customer=customer,
            asked_by=asked_by or self.admin,
            assignee=assignee,
            text=text,
        )

    def task(
        self,
        assignee,
        *,
        customer=None,
        account=None,
        overdue_by=1,
        status=Task.Status.PENDING,
        created_by=None,
        title="Call the exec sponsor",
    ):
        """A task due `overdue_by` days ago (0 = due today, not overdue)."""
        return Task.objects.create(
            customer=customer,
            account=account,
            title=title,
            assignee_name=assignee.name,
            assignee=assignee,
            created_by=created_by,
            due_date=self.today - timedelta(days=overdue_by),
            priority=Task.Priority.HIGH,
            status=status,
        )
