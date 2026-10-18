"""History (contract §10.5, D22): finished bundles the reader may read,
newest change first, 50 a page, filtered by agent, step kind and status;
nothing waiting; hidden counted, never named."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.agents.models import AgentBundle
from services.agents.tests.bundle_fixtures import HISTORY, BundleFixture, lifecycle, note


class HistoryTests(BundleFixture):
    def finished(self, record, status, *steps, agent="cs", title="Done"):
        bundle = self.bundle_of(record, *(steps or (note(),)), agent=agent, title=title)
        AgentBundle.objects.filter(pk=bundle.pk).update(status=status, run_by=self.csm)
        return bundle

    def get(self, user, **params):
        response = self.client_for(user).get(HISTORY, params)
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        return response.json()

    def test_lists_finished_bundles_only_newest_first(self):
        self.bundle_of(self.pizza, note())  # waiting: never in History
        first = self.finished(self.pizza, "done", title="First")
        second = self.finished(self.pizza, "rejected", title="Second")
        body = self.get(self.csm)
        self.assertEqual([b["id"] for b in body["results"]], [second.pk, first.pk])
        self.assertEqual(
            (body["count"], body["next"], body["previous"], body["hidden"]), (2, None, None, 0)
        )
        self.assertEqual(body["results"][1]["for"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(len(body["results"][1]["steps"]), 1)

    def test_hidden_is_counted_never_named(self):
        self.finished(self.soup, "done", title="Mona's")
        body = self.get(self.csm)
        self.assertEqual((body["count"], body["hidden"]), (0, 1))
        self.assertNotIn("Mona's", str(body))

    def test_a_workspace_level_bundle_is_not_counted_for_a_reader_not_shown_it(self):
        self.finished(None, "done", title="Whole company")
        self.assertEqual((self.get(self.csm)["count"], self.get(self.csm)["hidden"]), (0, 0))
        body = self.get(self.admin)
        self.assertEqual(
            ([b["title"] for b in body["results"]], body["hidden"]), (["Whole company"], 0)
        )

    def test_an_unreadable_draft_source_is_counted_once_never_named(self):
        from services.agents.tests.drafts_fixtures import ticket
        from services.agents.tests.fixtures import viewer

        source = ticket(self.pizza, number="TKT-9", department="finance")
        self.finished(
            self.pizza,
            "done",
            ("draft.reply", {"ticket_id": source.pk, "body": "Hi"}),
            note(),
            title="Finance reply",
        )
        # Vic is view-all in CS: a finance ticket is not his to read.
        for reader in (self.csm, viewer(self.org)):
            with self.subTest(reader=reader.email):
                body = self.get(reader)
                self.assertEqual((body["count"], body["hidden"]), (0, 1))
                self.assertNotIn("Finance reply", str(body))

    def test_filters(self):
        self.finished(self.pizza, "done", note(), title="Note")
        self.finished(self.pizza, "partly_done", lifecycle(), agent="sales", title="Move")
        self.assertEqual(
            [b["title"] for b in self.get(self.csm, agent="sales")["results"]], ["Move"]
        )
        self.assertEqual(
            [b["title"] for b in self.get(self.csm, step_kind="note.create")["results"]], ["Note"]
        )
        self.assertEqual(
            [b["title"] for b in self.get(self.csm, status="partly_done")["results"]], ["Move"]
        )
        for params, errors in (
            ({"agent": "hr"}, {"agent": ["Choose cs, sales or ops."]}),
            ({"step_kind": "x"}, {"step_kind": ["Choose an action kind."]}),
            (
                {"status": "waiting"},
                {"status": ["Choose done, partly done, rejected, expired or superseded."]},
            ),
        ):
            with self.subTest(params=params):
                response = self.client_for(self.csm).get(HISTORY, params)
                self.assertEqual((response.status_code, response.json()), (400, errors))

    def test_pages_of_50(self):
        for number in range(51):
            self.finished(self.pizza, "done", title=f"B{number}")
        first = self.get(self.csm)
        self.assertEqual((first["count"], len(first["results"])), (51, 50))
        self.assertTrue(first["next"].endswith("page=2"))
        second = self.get(self.csm, page=2)
        self.assertEqual(len(second["results"]), 1)
        self.assertTrue(second["previous"].endswith("page=1"))

    def test_the_pages_queries_do_not_grow_with_its_rows(self):
        self.finished(self.pizza, "done", note(), lifecycle(), title="One")
        client = self.client_for(self.csm)
        client.get(HISTORY)  # the session's own first reads
        with CaptureQueriesContext(connection) as one:
            client.get(HISTORY)
        for number in range(4):
            self.finished(self.dough, "done", note(), lifecycle(), title=f"More {number}")
        with CaptureQueriesContext(connection) as five:
            body = client.get(HISTORY).json()
        self.assertEqual(body["count"], 5)
        self.assertEqual(len(five), len(one))
