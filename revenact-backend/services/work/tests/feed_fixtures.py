"""The feed's tests' world: Brain's Waiting fixture (Carl owns Pizza Hut,
Dough Co, Pizza EMEA and Taco East and reports to Mona; Dana owns Taco Bell
and Taco West, which Carl cannot open; Mona owns Soup Co, which Carl cannot
open; Alice is an admin with view-all and Leadership; Lee is Leadership
without it), plus makers for to-dos, dated record tasks, suggestions and
reply drafts."""

import itertools
from datetime import timedelta

from django.utils import timezone

from services.accounts.models import User
from services.agents.tests.drafts_fixtures import draft, ticket
from services.brain.tests.waiting_fixtures import WaitingFixture
from services.customers.models import Customer, Task
from services.work.models import Recommendation

FEED = "/api/v1/work/feed/"
TEAM = "/api/v1/work/feed/team/"
COUNT = "/api/v1/work/feed/count/"
TODOS = "/api/v1/work/todos/"
_numbers = itertools.count(1)


class FeedFixture(WaitingFixture):
    def todo(
        self,
        owner,
        *,
        title="Book the dentist",
        due_in=None,
        priority="medium",
        status="pending",
        reason="",
    ):
        """A to-do of `owner`'s: no record, dated `due_in` days out (None: undated)."""
        return Task.objects.create(
            title=title,
            assignee=owner,
            assignee_name=owner.name,
            created_by=owner,
            due_date=None if due_in is None else self.today + timedelta(days=due_in),
            priority=priority,
            status=status,
            blocked_reason=reason,
        )

    def due(
        self,
        assignee,
        on,
        *,
        due_in,
        title="Call the sponsor",
        priority="medium",
        status="pending",
        reason="",
        created_by=None,
        source="manual",
    ):
        """A task on `on` (an organisation or an account) for `assignee`."""
        parent = {"customer": on} if isinstance(on, Customer) else {"account": on}
        return Task.objects.create(
            **parent,
            title=title,
            assignee=assignee,
            assignee_name=assignee.name,
            created_by=created_by or assignee,
            due_date=self.today + timedelta(days=due_in),
            priority=priority,
            status=status,
            blocked_reason=reason,
            source=source,
        )

    def suggestion(self, recipient, on, *, kind="renewal_due", title=None, suggested=None):
        """An open recommendation sent to `recipient` about `on`."""
        if isinstance(on, Customer):
            customer, account = on, None
        else:
            customer, account = on.customers.order_by("id").first(), on
        return Recommendation.objects.create(
            organisation=self.org,
            customer=customer,
            account=account,
            kind=kind,
            title=title or f"Prepare {on.name}'s renewal",
            why={"facts": ["Renews in 30 days"], "evidence": []},
            suggested_assignee=suggested or recipient,
            recipient=recipient,
        )

    def reply(self, owner, record, *, agent="cs"):
        """An open reply draft of `owner`'s answering a fresh ticket on `record`."""
        return draft(ticket(record, number=f"TKT-{next(_numbers)}"), owner, agent=agent)

    def age(self, row, days):
        type(row).objects.filter(pk=row.pk).update(created_at=timezone.now() - timedelta(days=days))

    def feed(self, user, **params):
        return self.as_user(User.objects.get(pk=user.pk)).get(FEED, params)

    def body(self, user, **params):
        response = self.feed(user, **params)
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        return response.json()

    def queue(self, user, **params):
        return self.as_user(User.objects.get(pk=user.pk)).get(TEAM, params)

    def queue_body(self, user, **params):
        response = self.queue(user, **params)
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        return response.json()

    @staticmethod
    def group(body, key):
        return next(g for g in body["groups"] if g["key"] == key)
