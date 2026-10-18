"""Where a thread's bundle goes, and which agent reads it (agent bundles D2
contract D2-4, D2-5, D2-10): the owner who may read the source; else the
ticket's department; else Unassigned. Mail goes only to its mailbox owner
(owner-only, 2026-10-17), whoever owns the record, if they may open it.
Tickets to the CS agent; mail to Sales on a record with an open deal or a
Sales owner."""

from services.accounts.models import User
from services.agents import routing
from services.agents.tests.intake_fixtures import IntakeFixture
from services.customers.models import Opportunity


class RoutingTests(IntakeFixture):
    def route(self, thread):
        found, reason = routing.route(thread)
        return (
            reason
            if found is None
            else (found.routed_to, found.user, found.department, found.queue)
        )

    def test_mail_goes_to_its_mailbox_owner_whoever_owns_the_record(self):
        _, mine = self.mail_thread(self.pizza, self.csm)
        self.assertEqual(self.route(mine), ("owner", self.csm, "", "mine"))
        # Mona's mail on Carl's record: hers, not his.
        _, above = self.mail_thread(self.pizza, self.mona, thread="t3")
        self.assertEqual(self.route(above), ("owner", self.mona, "", "mine"))
        # Carl's mail on a record nobody owns: still his.
        _, ownerless = self.mail_thread(self.loose, self.csm, thread="t4")
        self.assertEqual(self.route(ownerless), ("owner", self.csm, "", "mine"))

    def test_mail_on_a_record_its_mailbox_owner_cannot_open_is_skipped(self):
        # Carl's mail on Mona's Soup Co: Carl can't open it, and Mona (above
        # him, the record's owner) may not read his mail. Nobody could read it.
        _, below = self.mail_thread(self.soup, self.csm, thread="t2")
        self.assertEqual(self.route(below), "no_reader")

    def test_mail_whose_mailbox_owner_left_is_skipped(self):
        _, thread = self.mail_thread(self.pizza, self.csm, thread="t5")
        User.objects.filter(pk=self.csm.pk).update(is_active=False)
        thread.refresh_from_db()
        # Never to the record's owner, a department or an admin instead.
        self.assertEqual(self.route(thread), "no_reader")

    def test_a_ticket_goes_to_the_owner_then_the_department_then_admins(self):
        _, cs = self.ticket_thread(self.pizza)
        self.assertEqual(self.route(cs), ("owner", self.csm, "", "mine"))
        engineering = self.connector("jira", "engineering")
        _, eng = self.ticket_thread(self.pizza, connector=engineering, number="ENG-1")
        self.assertEqual(
            self.route(eng), ("department", None, "engineering", "department:engineering")
        )
        _, loose = self.ticket_thread(self.loose, number="ZD-2")
        self.assertEqual(self.route(loose), ("department", None, "cs", "department:cs"))
        everyone = self.connector("webhook", "")
        _, unassigned = self.ticket_thread(self.loose, connector=everyone, number="WH-1")
        self.assertEqual(self.route(unassigned), ("admins", None, "", "unassigned"))

    def test_an_owner_who_left_is_no_owner(self):
        User.objects.filter(pk=self.other.pk).update(is_active=False)
        _, thread = self.ticket_thread(self.taco)
        self.assertEqual(self.route(thread)[0], "department")

    def test_the_agent(self):
        _, ticket = self.ticket_thread(self.pizza)
        self.assertEqual(routing.choose_agent(ticket), "cs")
        _, mail = self.mail_thread(self.pizza, self.csm)
        self.assertEqual(routing.choose_agent(mail), "cs")
        deal = Opportunity.objects.create(customer=self.pizza, title="Upsell", stage="negotiation")
        self.assertEqual(routing.choose_agent(mail), "sales")
        Opportunity.objects.filter(pk=deal.pk).update(stage="closed_won")
        self.assertEqual(routing.choose_agent(mail), "cs")
        _, sales = self.mail_thread(self.deals, self.sam, thread="t9")
        self.assertEqual(routing.choose_agent(sales), "sales")
