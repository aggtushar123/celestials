"""?scope= on the feature-request list and detail (Brain delivery 4 spec
§1.2): the scope's book narrows the evidence before revenue and counts are
worked out; without it the routes behave exactly as before."""

from services.brain.tests.customers_fixtures import CustomersFixture

LIST = "/api/v1/requests/"


class RequestScopeTests(CustomersFixture):
    def setUp(self):
        self.sso = self.feature(
            "SSO with Okta", self.pizza, self.taco, self.east, self.soup, self.loose
        )
        self.export = self.feature("CSV export", self.taco)
        self.api = self.feature("Public API", self.dough)
        self.ask(self.api, self.dough, days_ago=120)

    def rows(self, user, query=""):
        response = self.as_user(user).get(f"{LIST}{query}")
        self.assertEqual(response.status_code, 200, response.json())
        return {row["title"]: row for row in response.json()}

    def test_without_a_scope_the_list_is_the_readers_as_before(self):
        rows = self.rows(self.csm)
        # Carl opens Taco Bell through his Taco East, and Loose Ltd (nobody's).
        self.assertEqual(set(rows), {"SSO with Okta", "CSV export", "Public API"})
        sso = rows["SSO with Okta"]
        self.assertEqual(float(sso["arr"]), 580000.0)
        self.assertEqual((sso["companies"], sso["interactions"]), (3, 4))

    def test_me_narrows_to_the_readers_book(self):
        rows = self.rows(self.csm, "?scope=me")
        self.assertEqual(list(rows), ["SSO with Okta", "Public API"])
        sso = rows["SSO with Okta"]
        # Pizza Hut and Taco East are Carl's; Taco East's Taco Bell is Dana's,
        # so it adds no revenue in Me.
        self.assertEqual(float(sso["arr"]), 300000.0)
        self.assertEqual((sso["companies"], sso["interactions"]), (1, 2))
        api = rows["Public API"]
        self.assertEqual((api["last_90_days"], api["previous_90_days"]), (1, 1))
        self.assertIsInstance(sso["arr"], str)

    def test_my_team_is_the_managers_and_their_reports_books(self):
        sso = self.rows(self.mona, "?scope=team")["SSO with Okta"]
        self.assertEqual(float(sso["arr"]), 350000.0)
        self.assertEqual((sso["companies"], sso["interactions"]), (2, 3))

    def test_company_is_the_unscoped_list(self):
        self.assertEqual(self.rows(self.admin, "?scope=company"), self.rows(self.admin))

    def test_in_company_a_leadership_reader_still_reads_only_what_they_may_open(self):
        rows = self.rows(self.lee, "?scope=company")
        self.assertEqual(list(rows), ["SSO with Okta"])
        self.assertEqual(float(rows["SSO with Okta"]["arr"]), 80000.0)

    def test_mail_the_reader_cant_read_stays_out_in_a_scope(self):
        self.ask(self.sso, self.pizza, kind="email", mailbox_owner=self.other)
        sso = self.rows(self.csm, "?scope=me")["SSO with Okta"]
        self.assertEqual(sso["interactions"], 2)

    def test_a_scope_the_reader_may_not_use_is_refused(self):
        response = self.as_user(self.csm).get(f"{LIST}?scope=team")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(), {"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}
        )
        response = self.as_user(self.csm).get(f"{LIST}?scope=everyone")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "SCOPE_UNKNOWN")

    def test_an_empty_scope_is_no_scope(self):
        self.assertEqual(self.rows(self.csm, "?scope="), self.rows(self.csm))

    def test_the_detail_is_narrowed_and_404s_when_nothing_is_left(self):
        client = self.as_user(self.csm)
        gone = client.get(f"{LIST}{self.export.id}/?scope=me")
        self.assertEqual(gone.status_code, 404)
        self.assertEqual(client.get(f"{LIST}{self.export.id}/").status_code, 200)
        detail = client.get(f"{LIST}{self.sso.id}/?scope=me").json()
        self.assertEqual(
            detail["companies_asking"],
            [{"id": self.pizza.id, "name": "Pizza Hut", "arr": "300000.00"}],
        )
        self.assertEqual(len(detail["evidence"]), 2)

    def test_a_patch_answers_with_the_unscoped_detail(self):
        response = self.as_user(self.admin).patch(
            f"{LIST}{self.export.id}/?scope=me", {"status": "planned"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.json())
        self.assertEqual(response.json()["status"], "planned")

    def test_a_scope_the_reader_may_not_use_is_refused_on_detail(self):
        response = self.as_user(self.csm).get(f"{LIST}{self.sso.id}/?scope=team")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "SCOPE_NOT_ALLOWED")
