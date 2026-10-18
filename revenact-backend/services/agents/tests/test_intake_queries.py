"""Intake and its queues cost the same however many rows there are
(agent bundles D2 contract §7): one thread's processing whatever else the
workspace holds; a department queue, a message bundle's detail and a
History page of message bundles. No query uses DISTINCT (Postgres 16)."""

from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.accounts.models import Organisation
from services.agents import intake, threads
from services.agents.models import AgentBundle
from services.agents.policy import policy_for, profiles_for
from services.agents.tests.bundle_fixtures import BUNDLES, HISTORY, note
from services.agents.tests.intake_fixtures import QUIET_AGO, IntakeFixture
from services.customers.tests.slack_fixtures import conversation

#: Measured on this branch (Task 20); raise only with a reason in the commit.
#: Contract §7 names: THREAD_RUN_QUERIES, DEPARTMENT_QUEUE_CEILING,
#: MESSAGE_DETAIL_QUERIES (the BUNDLE_DETAIL_CEILING case for message bundles) and
#: MESSAGE_HISTORY_QUERIES (the HISTORY_CEILING case for message bundles).
THREAD_RUN_QUERIES = 33
#: Slack escalations D3 on D4 (measured): a Slack thread's run reads its channel
#: row's shared flag (SE4-7, SC3-12) when the conversation's own flag is off (+1).
SLACK_THREAD_RUN_QUERIES = THREAD_RUN_QUERIES + 1
#: SE4-25: +1, the reader's participation, once per page.
DEPARTMENT_QUEUE_CEILING = 12
MESSAGE_DETAIL_QUERIES = 10
MESSAGE_HISTORY_QUERIES = 10


def no_distinct(test, queries):
    for query in queries.captured_queries:
        test.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])


class IntakeQueryTests(IntakeFixture):
    def measure(self, user, url):
        self.client_for(user).get(url)
        client = self.client_for(user)
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(client.get(url).status_code, 200)
        no_distinct(self, queries)
        return len(queries)

    def process(self, thread, prefix="ticket "):
        org = Organisation.objects.get(pk=self.org.pk)
        now = timezone.now()
        with patch("services.agents.policy.plan_credits", return_value=3000):
            profiles = profiles_for(org)
            prefs = policy_for(org)
            ctx, _ = self.thread_ctx(thread)
            line = self.thread_line(ctx, prefix)
            item = {
                "kind": "note.create",
                "record": ctx.thread_ref,
                "title": "Log it",
                "rationale": "Why.",
                "evidence": [line],
                "payload": {"title": f"Loop {thread.pk}", "body": "Locked out."},
            }
            with (
                patch("services.agents.intake.get_completion", return_value=self.answer(item)),
                CaptureQueriesContext(connection) as queries,
            ):
                intake.process(
                    org,
                    thread,
                    now=now,
                    today=self.today,
                    prefs=prefs,
                    profiles=profiles,
                    result=intake.IntakeResult(),
                )
        no_distinct(self, queries)
        return len(queries)

    def test_one_thread_costs_the_same_whatever_else_waits(self):
        connector = self.connector()
        # The first run in a workspace also makes its one-time settings row; measure after it.
        _, warm = self.ticket_thread(self.pizza, connector=connector, number="ZD-0")
        self.process(warm)
        _, first = self.ticket_thread(self.pizza, connector=connector, number="ZD-1")
        few = self.process(first)
        for n in range(2, 12):
            record = (self.taco, self.pizza, self.loose)[n % 3]
            _, other = self.ticket_thread(record, connector=connector, number=f"ZD-{n}")
            self.message_bundle(other, note(f"N{n}", "B"))
        _, last = self.ticket_thread(self.pizza, connector=connector, number="ZD-99")
        many = self.process(last)
        self.assertEqual(few, many)
        self.assertEqual(many, THREAD_RUN_QUERIES)

    def slack_thread(self, record, n):
        """A filed Slack conversation and its thread, quiet past the rule."""
        made = conversation(record, self.connector("slack", "cs"), title=f"Exports fail {n}")
        return made, threads.touch_conversation(made, timezone.now() - QUIET_AGO)

    def test_a_slack_thread_costs_a_ticket_thread_s_queries_and_its_channel_s_flag(self):
        """SE1-19: the conversation replaces the ticket; the run costs the same,
        plus the channel row's shared flag (D3 on D4)."""
        _, warm = self.slack_thread(self.pizza, 0)
        self.process(warm, "message ")
        _, first = self.slack_thread(self.pizza, 1)
        few = self.process(first, "message ")
        for n in range(2, 8):
            self.slack_thread((self.taco, self.pizza, self.loose)[n % 3], n)
        _, last = self.slack_thread(self.pizza, 99)
        many = self.process(last, "message ")
        self.assertEqual(few, many)
        self.assertEqual(many, SLACK_THREAD_RUN_QUERIES)

    def test_a_department_queue_does_not_grow(self):
        connector = self.connector("zendesk", "cs")
        _, thread = self.ticket_thread(self.loose, connector=connector)
        self.message_bundle(thread, note(), routed_to="department", department="cs")
        url = "/api/v1/work/feed/team/?scope=department:cs"
        few = self.measure(self.csm, url)
        for n in range(2, 8):
            record = (self.loose, self.pizza, self.taco)[n % 3]
            _, more = self.ticket_thread(record, connector=connector, number=f"ZD-{n}")
            self.message_bundle(more, note(f"N{n}", "B"), routed_to="department", department="cs")
        many = self.measure(self.csm, url)
        self.assertEqual(few, many)
        self.assertLessEqual(many, DEPARTMENT_QUEUE_CEILING)

    def test_a_message_bundles_detail_and_a_history_page(self):
        _, thread = self.mail_thread(self.pizza, self.csm)
        bundle = self.message_bundle(thread, note(), note("Two", "B"))
        detail = self.measure(self.csm, f"{BUNDLES}{bundle.pk}/")
        self.assertEqual(detail, MESSAGE_DETAIL_QUERIES)
        # More emails on the thread and more steps in a bundle cost nothing more.
        _, big = self.mail_thread(self.pizza, self.csm, thread="big")
        for n in range(4):
            self.mail_thread(self.pizza, self.csm, thread="big", subject=f"Re {n}")
        steps = [note(f"S{n}", "B") for n in range(7)]
        bigger = self.message_bundle(big, *steps)
        self.assertEqual(self.measure(self.csm, f"{BUNDLES}{bigger.pk}/"), detail)
        AgentBundle.objects.filter(pk=bundle.pk).update(status="done", run_by=self.csm)
        few = self.measure(self.csm, HISTORY)
        for n in range(5):
            _, more = self.mail_thread(self.pizza, self.csm, thread=f"h{n}")
            AgentBundle.objects.filter(pk=self.message_bundle(more, note(f"H{n}", "B")).pk).update(
                status="done", run_by=self.csm
            )
        many = self.measure(self.csm, HISTORY)
        self.assertEqual(few, many)
        self.assertEqual(many, MESSAGE_HISTORY_QUERIES)
