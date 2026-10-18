"""The Team drill-down: one person's open tasks in one state, only those the
reader may read."""

from services.work.tests.fixtures import WorkFixture


class DrillTests(WorkFixture):
    def titles(self, reader, assignee, state=None):
        url = f"/api/v1/work/tasks/?assignee={assignee.pk}"
        if state:
            url += f"&state={state}"
        return [row["title"] for row in self.ok(reader, url)["tasks"]]

    def test_a_manager_drills_into_a_reports_tasks_by_state(self):
        self.assertEqual(
            self.titles(self.mona, self.csm),
            [
                "Send the contract",
                "Call Pizza Hut",
                "Prep the Dough Co QBR",
                "EMEA sync",
                "Plan next year",
            ],
        )
        self.assertEqual(self.titles(self.mona, self.csm, "overdue"), ["Call Pizza Hut"])
        self.assertEqual(self.titles(self.mona, self.csm, "blocked"), ["Send the contract"])

    def test_only_what_the_reader_reads(self):
        self.assertEqual(self.titles(self.other, self.csm), ["West handover"])  # she made it
        # View-all reads every task on records it opens (owner decision 2026-10-07).
        self.assertEqual(
            self.titles(self.admin, self.csm),
            [
                "Send the contract",
                "Call Pizza Hut",
                "West handover",
                "Prep the Dough Co QBR",
                "EMEA sync",
                "Plan next year",
            ],
        )
        # Leadership reads every task too, but Lee opens none of Carl's records.
        self.assertEqual(self.titles(self.lee, self.csm), [])
        self.assertEqual(self.titles(self.stranger, self.csm), [])

    def test_refusals(self):
        for query, expected in (
            ("", {"assignee": ["Choose a person."]}),
            ("?assignee=me", {"assignee": ["Choose a person."]}),
            (
                f"?assignee={self.csm.pk}&state=late",
                {"state": ["Choose open, overdue or blocked."]},
            ),
        ):
            with self.subTest(query=query):
                response = self.get(self.mona, f"/api/v1/work/tasks/{query}")
                self.assertEqual((response.status_code, response.data), (400, expected))
