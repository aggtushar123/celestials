"""The assignee picker: every active member, with whether they can open the record."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.models import User
from services.work.tests.fixtures import WorkFixture


class AssigneeTests(WorkFixture):
    def test_every_active_member_with_whether_they_can_open_it(self):
        User.objects.filter(pk=self.lee.pk).update(is_active=False)
        body = self.ok(self.csm, f"/api/v1/work/assignees/?customer={self.pizza.pk}")
        self.assertEqual(
            [(p["name"], p["can_open"]) for p in body["people"]],
            [
                ("Alice Admin", True),
                ("Carl CSM", True),
                ("Dana CSM", False),
                ("Mona Manager", True),
            ],
        )
        self.assertEqual(body["people"][0]["function"], "leadership")

    def test_an_account_is_checked_as_an_account(self):
        body = self.ok(self.csm, f"/api/v1/work/assignees/?account={self.emea.pk}")
        self.assertEqual({p["name"]: p["can_open"] for p in body["people"]}["Dana CSM"], False)

    def test_a_record_the_caller_cannot_open_is_404_and_bad_queries_400(self):
        self.assertEqual(
            self.get(self.csm, f"/api/v1/work/assignees/?account={self.west.pk}").status_code, 404
        )
        self.assertEqual(
            self.get(
                self.stranger, f"/api/v1/work/assignees/?customer={self.pizza.pk}"
            ).status_code,
            404,
        )
        for query in ("", f"?customer={self.pizza.pk}&account={self.emea.pk}", "?customer=x"):
            with self.subTest(query=query):
                response = self.get(self.csm, f"/api/v1/work/assignees/{query}")
                self.assertEqual(
                    (response.status_code, response.data),
                    (400, {"detail": "Name one organisation or account."}),
                )


class AssigneeQueryCeilingTests(WorkFixture):
    #: Today 27 for the fixture's five active members (about five queries a
    #: member), plus a small margin. This guards the per-member `can_open`
    #: cost (capabilities, org-chart walk, the record check): it grows with
    #: the workspace, and a change that adds to it should be seen here. The
    #: optimisation (one bulk "who can open this record" query) is parked.
    CEILING = 30

    def test_the_picker_stays_under_its_query_ceiling(self):
        members = User.objects.filter(organisation=self.org, is_active=True).count()
        self.assertEqual(members, 5)
        for query in (f"customer={self.pizza.pk}", f"account={self.emea.pk}"):
            with self.subTest(query=query):
                with CaptureQueriesContext(connection) as queries:
                    response = self.get(self.csm, f"/api/v1/work/assignees/?{query}")
                self.assertEqual(response.status_code, 200)
                self.assertLessEqual(len(queries.captured_queries), self.CEILING)
