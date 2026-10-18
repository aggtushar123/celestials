"""The Work tests' world: BrainFixture's people and book (Carl owns Pizza
Hut, Dough Co, Pizza EMEA and Taco East and reports to Mona; Dana owns Taco
Bell and Taco West; Alice (admin, Leadership) opens every record; Lee
(Leadership, no view-all) opens only Loose Ltd; Gus is Globex's), plus open
work:

Carl's: "Call Pizza Hut" (2 days overdue, high), "Prep the Dough Co QBR"
(today), "EMEA sync" (Pizza EMEA, in 3 days), "Plan next year" (in 20 days),
"Send the contract" (Blocked, "Waiting on legal", 5 days past due), "Old
call" (completed) and "West handover" (Taco West, made by Dana: Carl cannot
open Taco West, so it is his but hidden from him). Dana's: "Taco Bell
review" (3 days overdue). Every task but the handover is its assignee's own.
Alice reads every task (view-all) on records she opens: all of them; Lee
reads every task (Leadership) on records he opens: only Loose Ltd's."""

from datetime import timedelta

from services.accounts.models import User
from services.brain.tests.fixtures import BrainFixture
from services.customers.models import Customer, Task


class WorkFixture(BrainFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        mk = cls.make_task
        cls.overdue = mk(
            "Call Pizza Hut", on=cls.pizza, assignee=cls.csm, due_in=-2, priority="high"
        )
        cls.due_today = mk("Prep the Dough Co QBR", on=cls.dough, assignee=cls.csm, due_in=0)
        cls.this_week = mk("EMEA sync", on=cls.emea, assignee=cls.csm, due_in=3)
        cls.later = mk("Plan next year", on=cls.pizza, assignee=cls.csm, due_in=20)
        cls.blocked = mk(
            "Send the contract",
            on=cls.dough,
            assignee=cls.csm,
            due_in=-5,
            status="blocked",
            reason="Waiting on legal",
        )
        cls.done = mk("Old call", on=cls.pizza, assignee=cls.csm, due_in=-9, status="completed")
        cls.handed = mk(
            "West handover", on=cls.west, assignee=cls.csm, created_by=cls.other, due_in=-1
        )
        cls.danas = mk("Taco Bell review", on=cls.taco, assignee=cls.other, due_in=-3)

    @classmethod
    def make_task(
        cls,
        title,
        *,
        on,
        assignee,
        created_by=None,
        due_in=0,
        status="pending",
        reason="",
        priority="medium",
    ):
        parent = {"customer": on} if isinstance(on, Customer) else {"account": on}
        return Task.objects.create(
            **parent,
            title=title,
            assignee=assignee,
            assignee_name=assignee.name,
            created_by=created_by or assignee,
            due_date=cls.today + timedelta(days=due_in),
            status=status,
            blocked_reason=reason,
            priority=priority,
        )

    def get(self, user, url):
        """`url` as a fresh copy of `user` (no memoised org chart)."""
        return self.as_user(User.objects.get(pk=user.pk)).get(url)

    def ok(self, user, url):
        response = self.get(user, url)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data
