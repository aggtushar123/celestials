"""Bundles cost the same however many rows there are (contract §12): the
detail up to 8 steps, a History page of 50, and the queue rail for every
kind of reader. No query uses DISTINCT (Postgres 16).

Measured kinds: note.create, record.lifecycle and draft.reply previews are
read once per detail, whatever the number of steps. survey.send and
campaign.send previews count their audience for the reader per step while
it is proposed (`builder.audience_counts`: the attribute names, the reached
contacts and the matching records), a fixed AUDIENCE_STEP_QUERIES each; that
is pinned too. A finished step's audience is null: History pays nothing."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.agents.models import AgentBundle
from services.agents.tests.builder_fixtures import definition
from services.agents.tests.bundle_fixtures import BUNDLES, HISTORY, BundleFixture, lifecycle, note
from services.agents.tests.drafts_fixtures import ticket
from services.agents.tests.intake_fixtures import IntakeFixture

#: Measured on this branch (Task 17); raise only with a reason in the commit.
#: Any number of note, lifecycle and draft-reply steps (Carl, who reads the drafts' tickets).
#: SE4-25: +1, the reader's participation, once per page.
BUNDLE_DETAIL_CEILING = 11
#: What each survey.send or campaign.send step adds to the detail.
AUDIENCE_STEP_QUERIES = 3
#: A page of 50 finished bundles.
#: SE4-25: +1, the reader's participation, once per page.
HISTORY_CEILING = 9
#: The most any reader costs (Mona, a manager: 42; Alice and Lee: 41; Carl: 26).
QUEUES_CEILING = 42
#: The exact counts behind the ceilings, so a constant regression inside a
#: ceiling's slack still fails. Raise only with a reason in the commit.
#: SE4-25: +1, the reader's participation, once per page.
#: Private mail (2026-10-17): Alice +1, the draft's email rule now asks which
#: records she may open (shared mail) where the chain rule needed nothing.
DETAIL_QUERIES = {"notes": 9, "drafts_alice": 11, "drafts_carl": 11}
#: The detail of a bundle with drafts and survey/campaign steps, less those
#: steps' own AUDIENCE_STEP_QUERIES each (Alice pays one more than her drafts' 10).
#: SE4-25: +1, the reader's participation, once per page.
AUDIENCE_BASE_QUERIES = {"alice": 11, "carl": 11}
HISTORY_QUERIES = 9
#: +1 each (was 25/41/40/40): the enabled-connector read in
#: queue_bundles.listed() that decides the department/Unassigned rows (Task 16).
QUEUE_QUERIES = {"carl": 26, "mona": 42, "alice": 41, "lee": 41}
#: With a CS connector the rail also has a department:cs queue (its bundle count) and a
#: needs_customer count behind its own atomic guard (R2D3-12): the COUNT is one query, the
#: savepoint pair around it two more in a test transaction (Task 13). Carl reads one routed queue.
ROUTED_QUEUE_QUERIES = {"carl": 32}
QUEUES = "/api/v1/work/queues/"


def survey():
    return {
        "name": "Q4 NPS",
        "survey_type": "nps",
        "subject": "Two minutes?",
        "intro": "We'd love your view.",
        "segment": definition(),
        "roles": ["champion"],
        "draft_only": False,
    }


def campaign():
    return {
        "name": "Check-in",
        "segment": definition(),
        "roles": ["champion"],
        "subject": "Hello",
        "body": "Hi {first_name}",
        "draft_only": False,
    }


class BundleQueryTests(BundleFixture):
    def measure(self, user, url):
        self.client_for(user).get(url)  # warm per-process caches
        client = self.client_for(user)
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(client.get(url).status_code, 200)
        for query in queries.captured_queries:
            self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])
        return len(queries)

    def mixed(self, *, drafts=0, surveys=0, campaigns=0, notes=0):
        """A bundle on Pizza Hut of `notes` notes, then `drafts` reply drafts
        (each on its own Pizza Hut ticket), surveys and campaigns."""
        bundle = self.bundle_of(self.pizza, *(note(f"M{n}", "B") for n in range(notes)))
        for n in range(drafts):
            source = ticket(self.pizza, number=f"TKT-{bundle.pk}-{n}")
            self.step(
                self.pizza,
                kind="draft.reply",
                payload={"ticket_id": source.pk, "body": "Hi"},
                bundle=bundle,
            )
        for _ in range(surveys):
            self.step(None, kind="survey.send", payload=survey(), bundle=bundle, agent="ops")
        for _ in range(campaigns):
            self.step(None, kind="campaign.send", payload=campaign(), bundle=bundle, agent="ops")
        return bundle

    def test_the_detail_does_not_grow_with_its_steps(self):
        small = self.bundle_of(self.pizza, note("N0", "B"), lifecycle())
        big = self.bundle_of(self.pizza, *(note(f"N{n}", "B") for n in range(7)), lifecycle())
        few = self.measure(self.csm, f"{BUNDLES}{small.pk}/")
        many = self.measure(self.csm, f"{BUNDLES}{big.pk}/")
        self.assertEqual(few, many)
        self.assertEqual(many, DETAIL_QUERIES["notes"])
        self.assertLessEqual(many, BUNDLE_DETAIL_CEILING)

    def test_draft_replies_do_not_grow_the_detail(self):
        for reader, name in ((self.admin, "alice"), (self.csm, "carl")):
            few = self.measure(reader, f"{BUNDLES}{self.mixed(drafts=1, notes=1).pk}/")
            many = self.measure(reader, f"{BUNDLES}{self.mixed(drafts=4, notes=4).pk}/")
            self.assertEqual(few, many)
            self.assertEqual(many, DETAIL_QUERIES[f"drafts_{name}"])
            self.assertLessEqual(many, BUNDLE_DETAIL_CEILING)

    def test_each_survey_or_campaign_step_costs_a_fixed_few(self):
        for reader, name in ((self.admin, "alice"), (self.csm, "carl")):
            base = AUDIENCE_BASE_QUERIES[name]
            two = self.mixed(drafts=2, surveys=1, campaigns=1)
            eight = self.mixed(drafts=2, surveys=3, campaigns=3)
            two, eight = (self.measure(reader, f"{BUNDLES}{b.pk}/") for b in (two, eight))
            self.assertEqual(two, base + 2 * AUDIENCE_STEP_QUERIES)
            self.assertEqual(eight, base + 6 * AUDIENCE_STEP_QUERIES)

    def finished(self, n):
        for number in range(n):
            bundle = self.bundle_of(self.pizza, note(f"H{number}", "B"), lifecycle())
            AgentBundle.objects.filter(pk=bundle.pk).update(status="done", run_by=self.csm)

    def test_a_history_page_does_not_grow_with_its_rows(self):
        self.finished(2)
        few = self.measure(self.csm, HISTORY)
        self.finished(48)
        many = self.measure(self.csm, HISTORY)
        self.assertEqual(len(self.client_for(self.csm).get(HISTORY).json()["results"]), 50)
        self.assertEqual(few, many)
        self.assertEqual(many, HISTORY_QUERIES)
        self.assertLessEqual(many, HISTORY_CEILING)

    def test_history_send_rows_do_not_grow_the_page(self):
        # A step that left `proposed` shows no audience (null): History pays
        # nothing per survey.send or campaign.send row.
        def finished_sends(n):
            for _ in range(n):
                bundle = self.mixed(surveys=1, campaigns=1)
                bundle.steps.update(status="applied")
                AgentBundle.objects.filter(pk=bundle.pk).update(status="done", run_by=self.csm)

        finished_sends(1)
        few = self.measure(self.csm, HISTORY)
        finished_sends(5)
        many = self.measure(self.csm, HISTORY)
        self.assertEqual(few, many)
        self.assertEqual(many, HISTORY_QUERIES)
        rows = self.client_for(self.csm).get(HISTORY).json()["results"]
        previews = [step["preview"] for row in rows for step in row["steps"]]
        self.assertEqual(len(previews), 12)
        for preview in previews:
            shown = preview.get("survey") or preview.get("campaign")
            self.assertIsNone(shown["audience"])

    def test_the_queue_rail_does_not_grow(self):
        readers = (self.csm, self.mona, self.admin, self.lee)
        names = ("carl", "mona", "alice", "lee")
        self.bundle_of(self.pizza, note())
        few = [self.measure(reader, QUEUES) for reader in readers]
        for number in range(6):
            self.bundle_of(self.pizza, note(f"Q{number}", "B"))
            self.bundle_of(self.taco, note(f"T{number}", "B"))
            self.bundle_of(self.soup, note(f"S{number}", "B"))
        many = [self.measure(reader, QUEUES) for reader in readers]
        self.assertEqual(few, many)
        self.assertEqual(dict(zip(names, many, strict=True)), QUEUE_QUERIES)
        self.assertLessEqual(max(many), QUEUES_CEILING)


class RoutedQueueQueryTests(IntakeFixture):
    """A routed queue (a connector's department) adds its bundle count and its
    needs_customer count to the rail: each one COUNT, which tests wrap in a
    savepoint (savepoint, count, release: 3 queries each)."""

    def measure(self, user):
        self.client_for(user).get(QUEUES)
        client = self.client_for(user)
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(client.get(QUEUES).status_code, 200)
        for query in queries.captured_queries:
            self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])
        return len(queries)

    def test_a_routed_queue_adds_two_counts_and_does_not_grow(self):
        before = self.measure(self.csm)
        self.connector("zendesk", "cs")
        after = self.measure(self.csm)
        rail = self.client_for(self.csm).get(QUEUES).json()["queues"]
        self.assertIn("department:cs", [queue["key"] for queue in rail])
        self.assertEqual(after, before + 6)  # its bundle count (3) and its needs_customer count (3)
        for number in range(6):
            self.bundle_of(self.pizza, note(f"R{number}", "B"))
        self.assertEqual(self.measure(self.csm), after)
        self.assertEqual(after, ROUTED_QUEUE_QUERIES["carl"])


class ThreadSourceQueryTests(IntakeFixture):
    """The source block is read once per page (Task 15): a thread-sourced
    bundle costs one query more than a nightly one, however many are shown."""

    def measure(self, url):
        client = self.client_for(self.csm)
        client.get(url)
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(self.client_for(self.csm).get(url).status_code, 200)
        return len(queries)

    def finished_threads(self, start, n):
        connector = self.connector()
        for number in range(start, start + n):
            _, thread = self.ticket_thread(self.pizza, connector=connector, number=f"ZD-{number}")
            bundle = self.message_bundle(thread, note(f"H{number}", "B"))
            AgentBundle.objects.filter(pk=bundle.pk).update(status="done", run_by=self.csm)

    def test_a_threads_detail_costs_one_query_more(self):
        nightly = self.bundle_of(self.pizza, note("N", "B"))
        _, thread = self.ticket_thread(self.pizza)
        sourced = self.message_bundle(thread, note("T", "B"))
        base = self.measure(f"{BUNDLES}{nightly.pk}/")
        self.assertEqual(self.measure(f"{BUNDLES}{sourced.pk}/"), base + 1)

    def test_a_history_page_reads_its_threads_in_one_query(self):
        self.finished_threads(0, 2)
        few = self.measure(HISTORY)
        self.finished_threads(2, 10)
        many = self.measure(HISTORY)
        self.assertEqual(few, many)
        # The threads are the one extra query: a page of nightly bundles has none.
        AgentBundle.objects.filter(thread__isnull=False).delete()
        for n in range(3):
            nightly = self.bundle_of(self.pizza, note(f"Z{n}", "B"))
            AgentBundle.objects.filter(pk=nightly.pk).update(status="done", run_by=self.csm)
        self.assertEqual(many, self.measure(HISTORY) + 1)
