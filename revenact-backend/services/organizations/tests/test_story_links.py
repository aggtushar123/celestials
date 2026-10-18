"""Slack escalations D4 contract §2.3, §2.4, SE4-17 (spec §6): the Slack
item names its tickets, a ticket names its thread, each only for a reader
who may read it on its own; otherwise counted, never named."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.models import User
from services.customers.models import Ticket

from .story_fixtures import StoryFixture

#: Contract §6: the story's own 30 (StoryQueryCountTests: a fresh user's
#: organisation and role included) plus one read of the Slack items' tickets.
STORY_SLACK_LINKS_QUERIES = 31


class StoryLinksTests(StoryFixture):
    def linked(
        self,
        *,
        department="",
        conversation_department="",
        thread_on=None,
        ticket_on=None,
        **thread_fields,
    ):
        thread = self.slack(
            thread_on or self.pizza,
            channel_name="all-alfiee",
            department=conversation_department,
            **thread_fields,
        )
        ticket = self.ticket(
            ticket_on or self.pizza,
            number="KAN-2",
            status=Ticket.Status.IN_PROGRESS,
            department=department,
            conversation=thread,
            external_url="https://alfiee.atlassian.net/browse/KAN-2",
        )
        Ticket.objects.filter(pk=ticket.pk).update(assignee_name="Jesh Sanghvi")
        return thread, ticket

    def item(self, body, kind, ident):
        return next(i for i in body["items"] if (i["kind"], i["id"]) == (kind, ident))

    def test_both_ways_for_a_reader_who_reads_both(self):
        thread, ticket = self.linked()
        body = self.story()
        slack = self.item(body, "slack", thread.pk)
        self.assertEqual(
            (slack["tickets"], slack["hidden_links"]),
            (
                [
                    {
                        "id": ticket.pk,
                        "number": "KAN-2",
                        "status": "in-progress",
                        "assignee": "Jesh Sanghvi",
                        "url": "https://alfiee.atlassian.net/browse/KAN-2",
                    }
                ],
                0,
            ),
        )
        ticket_item = self.item(body, "ticket", ticket.pk)
        self.assertEqual(
            (ticket_item["from_slack"], ticket_item["hidden_links"]),
            ({"id": thread.pk, "channel": "#all-alfiee", "started_by": "Faiz Jamal"}, 0),
        )
        self.assertNotIn("_record", slack)
        self.assertNotIn("_conversation", ticket_item)

    def test_another_department_s_side_is_counted_never_named(self):
        thread, ticket = self.linked(department="engineering")  # Carl is Customer Success
        slack = self.item(self.story(), "slack", thread.pk)
        self.assertEqual((slack["tickets"], slack["hidden_links"]), ([], 1))
        thread2, ticket2 = self.linked(conversation_department="engineering")
        ticket_item = self.item(self.story(), "ticket", ticket2.pk)
        self.assertEqual((ticket_item["from_slack"], ticket_item["hidden_links"]), (None, 1))

    def test_a_side_on_another_record_is_counted_never_named(self):
        # The thread on the organisation, its ticket on one of its accounts:
        # the reader reads both departments, but the sides are on two records.
        thread, ticket = self.linked(ticket_on=self.emea)
        body = self.story()
        slack = self.item(body, "slack", thread.pk)
        self.assertEqual((slack["tickets"], slack["hidden_links"]), ([], 1))
        ticket_item = self.item(body, "ticket", ticket.pk)
        self.assertEqual((ticket_item["from_slack"], ticket_item["hidden_links"]), (None, 1))

    def test_a_thread_on_an_account_and_its_ticket_on_the_organisation(self):
        thread, ticket = self.linked(thread_on=self.emea)
        body = self.story()
        self.assertEqual(
            (
                self.item(body, "slack", thread.pk)["tickets"],
                self.item(body, "slack", thread.pk)["hidden_links"],
            ),
            ([], 1),
        )
        ticket_item = self.item(body, "ticket", ticket.pk)
        self.assertEqual((ticket_item["from_slack"], ticket_item["hidden_links"]), (None, 1))

    def test_both_on_the_same_account_are_named(self):
        thread, ticket = self.linked(thread_on=self.emea, ticket_on=self.emea)
        body = self.story()
        self.assertEqual(
            [line["id"] for line in self.item(body, "slack", thread.pk)["tickets"]], [ticket.pk]
        )
        self.assertEqual(self.item(body, "ticket", ticket.pk)["from_slack"]["id"], thread.pk)

    def test_a_link_that_is_not_https_is_null(self):
        thread, ticket = self.linked()
        Ticket.objects.filter(pk=ticket.pk).update(
            external_url="http://alfiee.atlassian.net/browse/KAN-2"
        )
        slack = self.item(self.story(), "slack", thread.pk)
        self.assertIsNone(slack["tickets"][0]["url"])

    def test_the_thread_names_its_member_starter_as_the_slack_item_does(self):
        thread, ticket = self.linked(started_by=self.csm)
        body = self.story()
        self.assertEqual(self.item(body, "slack", thread.pk)["actor"]["name"], self.csm.name)
        self.assertEqual(
            self.item(body, "ticket", ticket.pk)["from_slack"]["started_by"], self.csm.name
        )

    def test_the_slack_item_names_the_people_its_title_mentions(self):
        """CC-14: the Slack item's title reads "@<name>" for a known mention."""
        thread = self.slack(
            self.pizza,
            title="<@U0FAIZ> exports fail",
            people={"U0FAIZ": {"name": "Faiz Jamal", "member": None}},
        )
        self.assertEqual(
            self.item(self.story(), "slack", thread.pk)["title"], "@Faiz Jamal exports fail"
        )

    def test_leadership_reads_every_department(self):
        thread, _ = self.linked(department="engineering")
        slack = self.item(self.story(user=self.admin), "slack", thread.pk)
        self.assertEqual(len(slack["tickets"]), 1)

    def test_unlinked_items_say_nothing(self):
        thread = self.slack(self.pizza)
        ticket = self.ticket(self.pizza)
        body = self.story()
        self.assertEqual(self.item(body, "slack", thread.pk)["tickets"], [])
        self.assertIsNone(self.item(body, "ticket", ticket.pk)["from_slack"])

    def test_slack_items_cost_one_read_whatever_their_number(self):
        def count():
            # A fresh user, as a real request loads one (loaded outside the count).
            user = User.objects.get(pk=self.admin.pk)
            with CaptureQueriesContext(connection) as queries:
                self.story(user=user)
            return len(queries)

        self.linked()
        self.story(user=self.admin)
        few = count()
        for _ in range(6):
            self.linked()
        self.assertEqual(count(), few)
        self.assertEqual(few, STORY_SLACK_LINKS_QUERIES)
