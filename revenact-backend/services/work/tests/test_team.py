"""Team: one row per person in the reader's scope with open, overdue and
blocked counts over what the reader reads; the rest counted in `hidden`."""

from datetime import timedelta

from services.accounts.models import User
from services.work.tests.fixtures import WorkFixture

URL = "/api/v1/work/team/"


def rows(body):
    return [
        (p["person"]["name"], p["open"], p["overdue"], p["blocked"], p["oldest_overdue"])
        for p in body["people"]
    ]


class TeamTests(WorkFixture):
    def test_a_manager_sees_their_team_with_the_unreadable_counted(self):
        body = self.ok(self.mona, f"{URL}?scope=team")
        self.assertEqual(
            rows(body),
            [
                ("Carl CSM", 5, 1, 1, (self.today - timedelta(days=2)).isoformat()),
                ("Mona Manager", 0, 0, 0, None),
            ],
        )
        self.assertEqual(
            (body["scope"], body["hidden"], body["today"]), ("team", 1, self.today.isoformat())
        )
        self.assertEqual(
            body["people"][0]["person"], {"id": self.csm.pk, "name": "Carl CSM", "active": True}
        )

    def test_the_default_is_the_widest_scope(self):
        self.assertEqual(self.ok(self.mona, URL)["scope"], "team")
        self.assertEqual(self.ok(self.csm, URL)["scope"], "me")
        self.assertEqual(self.ok(self.admin, URL)["scope"], "company")

    def test_me_is_my_own_row(self):
        body = self.ok(self.csm, f"{URL}?scope=me")
        self.assertEqual(
            rows(body), [("Carl CSM", 5, 1, 1, (self.today - timedelta(days=2)).isoformat())]
        )
        self.assertEqual(body["hidden"], 1)

    def test_view_all_counts_every_task_in_the_company(self):
        # View-all reads every task on the records it opens: all of them here,
        # so nothing is hidden (owner decision 2026-10-07).
        body = self.ok(self.admin, f"{URL}?scope=company")
        self.assertEqual(
            rows(body),
            [
                ("Carl CSM", 6, 2, 1, (self.today - timedelta(days=2)).isoformat()),
                ("Dana CSM", 1, 1, 0, (self.today - timedelta(days=3)).isoformat()),
                ("Alice Admin", 0, 0, 0, None),
                ("Lee Lead", 0, 0, 0, None),
                ("Mona Manager", 0, 0, 0, None),
            ],
        )
        self.assertEqual(body["hidden"], 0)

    def test_leadership_counts_every_task_on_records_it_opens(self):
        # Lee reads every task but opens only Loose Ltd: Carl's and Dana's are hidden.
        body = self.ok(self.lee, f"{URL}?scope=company")
        self.assertEqual({tuple(r[1:4]) for r in rows(body)}, {(0, 0, 0)})
        self.assertEqual(body["hidden"], 7)
        self.make_task(
            "Tidy Loose Ltd", on=self.loose, assignee=self.other, created_by=self.other, due_in=-1
        )
        body = self.ok(self.lee, f"{URL}?scope=company")
        self.assertEqual(rows(body)[0][:3], ("Dana CSM", 1, 1))
        self.assertEqual(body["hidden"], 7)

    def test_a_deactivated_person_stays_while_they_hold_work(self):
        User.objects.filter(pk=self.csm.pk).update(is_active=False)
        User.objects.filter(pk=self.lee.pk).update(is_active=False)
        team = self.ok(self.mona, f"{URL}?scope=team")
        self.assertEqual(team["people"][0]["person"]["active"], False)
        company = self.ok(self.admin, f"{URL}?scope=company")
        self.assertNotIn("Lee Lead", [name for name, *_ in rows(company)])

    def test_refusals(self):
        refused = self.get(self.other, f"{URL}?scope=team")
        self.assertEqual(
            (refused.status_code, refused.data),
            (403, {"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}),
        )
        unknown = self.get(self.mona, f"{URL}?scope=everyone")
        self.assertEqual(
            (unknown.status_code, unknown.data),
            (400, {"code": "SCOPE_UNKNOWN", "detail": "Choose me, team or company."}),
        )
        self.assertEqual(self.get(self.stranger, f"{URL}?scope=company").status_code, 403)
