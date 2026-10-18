"""Where a bundle came from, as the panel and the rows say it (agent
bundles D2 contract §3): the source block for mail, a ticket and the
nightly review; the department; the flags; the feed row's channel and
routing. A page reads its threads once."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.agents.bundle_payloads import GONE_SOURCE, source_blocks
from services.agents.models import AgentBundle
from services.agents.tests.bundle_fixtures import BUNDLES, note
from services.agents.tests.intake_fixtures import IntakeFixture
from services.agents.tests.outside_fixtures import OutsideFixture
from services.customers.models import Ticket


class SourceBlockTests(IntakeFixture):
    def detail(self, user, bundle):
        return self.client_for(user).get(f"{BUNDLES}{bundle.pk}/").json()

    def test_mail(self):
        email, thread = self.mail_thread(self.pizza, self.csm)
        self.mail_thread(self.pizza, self.csm, body="And again.")
        source = self.detail(self.csm, self.message_bundle(thread, note()))["source"]
        self.assertEqual(
            {
                k: source[k]
                for k in ("kind", "label", "channel", "from", "messages", "ticket", "link")
            },
            {
                "kind": "thread",
                "label": "Email",
                "channel": "mail",
                "from": "ann@x.com",
                "messages": 2,
                "ticket": None,
                "link": None,
            },
        )
        self.assertIsNotNone(source["last_message_at"])

    def test_mail_counts_only_the_threads_own_record(self):
        from services.agents.tests.drafts_fixtures import inbound

        _, thread = self.mail_thread(self.pizza, self.csm)
        # The same mailbox thread, newer, filed on another record: not this
        # thread's (the evidence reads only the thread's own record).
        inbound(self.dough, self.csm, hours=0, sender=("Bob", "bob@y.com"), message_id="<o@y>")
        source = self.detail(self.csm, self.message_bundle(thread, note()))["source"]
        self.assertEqual((source["from"], source["messages"]), ("ann@x.com", 1))

    def test_a_ticket_with_its_link_and_a_department(self):
        ticket, thread = self.ticket_thread(self.loose)
        Ticket.objects.filter(pk=ticket.pk).update(
            external_url="https://acme.zendesk.com/agent/tickets/1042"
        )
        body = self.detail(
            self.csm, self.message_bundle(thread, note(), routed_to="department", department="cs")
        )
        self.assertEqual(
            {
                k: body["source"][k]
                for k in ("label", "channel", "from", "messages", "ticket", "link")
            },
            {
                "label": "Zendesk",
                "channel": "zendesk",
                "from": "ann@x.com",
                "messages": 1,
                "ticket": "ZD-1042",
                "link": "https://acme.zendesk.com/agent/tickets/1042",
            },
        )
        self.assertEqual(body["department"], {"key": "cs", "label": "Customer Success"})
        self.assertEqual((body["for"], body["can_refresh"]), (None, True))

    def test_the_nightly_review(self):
        body = self.detail(self.csm, self.bundle_of(self.pizza, note()))
        self.assertEqual(
            body["source"],
            {
                "kind": "nightly",
                "label": "Nightly review",
                "channel": None,
                "from": "",
                "messages": 0,
                "last_message_at": None,
                "ticket": None,
                "link": None,
            },
        )
        self.assertEqual(
            (body["department"], body["can_refresh"], body["has_newer_message"]),
            (None, False, False),
        )

    def test_the_payload_builder_reads_a_gone_thread_as_the_empty_message_block(self):
        # The API never shows this (a bundle whose thread is gone is 404 for
        # everyone); the builder keeps the contract's block for the function.
        _, thread = self.ticket_thread(self.pizza)
        bundle = self.message_bundle(thread, note())
        bundle.thread_id = 10**9
        self.assertEqual(source_blocks([bundle]), {bundle.pk: GONE_SOURCE})
        self.assertEqual(
            GONE_SOURCE,
            {
                "kind": "thread",
                "label": "Message",
                "channel": None,
                "from": "",
                "messages": 0,
                "last_message_at": None,
                "ticket": None,
                "link": None,
            },
        )

    def feed_row(self, user, bundle, url="/api/v1/work/feed/?kind=bundle"):
        feed = self.client_for(user).get(url).json()
        (row,) = [
            i for g in feed["groups"] for i in g["items"] if i["key"] == f"bundle:{bundle.pk}"
        ]
        return row

    def test_the_feed_row_says_its_channel_and_routing(self):
        _, thread = self.ticket_thread(self.pizza)
        bundle = self.message_bundle(thread, note())
        row = self.feed_row(self.csm, bundle)
        self.assertEqual(
            row["detail"]["source"], {"kind": "thread", "label": "Zendesk", "channel": "zendesk"}
        )
        # The row names the channel as the panel's source block does (contract §3.3).
        self.assertEqual(
            row["detail"]["source"]["label"], self.detail(self.csm, bundle)["source"]["label"]
        )
        self.assertEqual((row["detail"]["routed_to"], row["detail"]["department"]), ("owner", None))

    def test_a_mail_feed_row_says_email(self):
        _, thread = self.mail_thread(self.pizza, self.csm)
        bundle = self.message_bundle(thread, note())
        row = self.feed_row(self.csm, bundle)
        self.assertEqual(
            row["detail"]["source"], {"kind": "thread", "label": "Email", "channel": "mail"}
        )
        self.assertEqual(self.detail(self.csm, bundle)["source"]["label"], "Email")

    def test_a_department_queue_row_says_its_channel(self):
        connector = self.connector("zendesk", "cs")
        _, thread = self.ticket_thread(self.loose, connector=connector)
        bundle = self.message_bundle(thread, note(), routed_to="department", department="cs")
        row = self.feed_row(self.csm, bundle, "/api/v1/work/feed/team/?scope=department:cs")
        self.assertEqual(
            row["detail"]["source"], {"kind": "thread", "label": "Zendesk", "channel": "zendesk"}
        )
        self.assertEqual(self.detail(self.csm, bundle)["source"]["label"], "Zendesk")

    def test_a_nightly_feed_row_says_nightly_review(self):
        bundle = self.bundle_of(self.pizza, note())
        row = self.feed_row(self.csm, bundle)
        self.assertEqual(
            row["detail"]["source"], {"kind": "nightly", "label": "Nightly review", "channel": None}
        )

    def test_a_page_reads_its_threads_once(self):
        def history_queries():
            client = self.client_for(self.csm)
            client.get("/api/v1/agents/bundles/history/")
            with CaptureQueriesContext(connection) as queries:
                client.get("/api/v1/agents/bundles/history/")
            return len(queries)

        connector = self.connector()
        for n in range(2):
            _, thread = self.ticket_thread(self.pizza, connector=connector, number=f"ZD-{n}")
            AgentBundle.objects.filter(
                pk=self.message_bundle(thread, note(f"N{n}", "B")).pk
            ).update(status="done", run_by=self.csm)
        few = history_queries()
        for n in range(2, 6):
            _, thread = self.ticket_thread(self.pizza, connector=connector, number=f"ZD-{n}")
            AgentBundle.objects.filter(
                pk=self.message_bundle(thread, note(f"N{n}", "B")).pk
            ).update(status="done", run_by=self.csm)
        self.assertEqual(few, history_queries())


class SlackSourceBlockTests(OutsideFixture):
    """Slack escalations D1: a Slack thread's block reads its conversation."""

    def test_a_slack_thread_names_its_poster_messages_and_link(self):
        from services.customers.models import SlackConversation
        from services.customers.tests.slack_fixtures import msg

        conversation, thread = self.slack_thread(self.pizza)
        SlackConversation.objects.filter(pk=conversation.pk).update(
            messages=[*conversation.messages, msg("1760340999.000100", "Dana", "Seen it.")]
        )
        source = (
            self.client_for(self.csm)
            .get(f"{BUNDLES}{self.message_bundle(thread, note()).pk}/")
            .json()["source"]
        )
        self.assertEqual(
            {k: source[k] for k in ("label", "channel", "from", "messages", "ticket", "link")},
            {
                "label": "Slack",
                "channel": "slack",
                "from": "Faiz Jamal",
                "messages": 2,
                "ticket": None,
                "link": conversation.url,
            },
        )

    def test_a_page_of_slack_threads_reads_them_once(self):
        def history_queries():
            client = self.client_for(self.csm)
            client.get("/api/v1/agents/bundles/history/")
            with CaptureQueriesContext(connection) as queries:
                client.get("/api/v1/agents/bundles/history/")
            return len(queries)

        connector = self.slack_connector()

        def add(n):
            _, thread = self.slack_thread(self.pizza, connector, ts=f"17603399{n:02d}.000100")
            AgentBundle.objects.filter(
                pk=self.message_bundle(thread, note(f"N{n}", "B")).pk
            ).update(status="done", run_by=self.csm)

        for n in range(2):
            add(n)
        few = history_queries()
        for n in range(2, 6):
            add(n)
        self.assertEqual(few, history_queries())
