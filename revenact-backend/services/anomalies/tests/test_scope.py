"""?scope= on the anomaly list and detail (Brain delivery 4 spec §1.2):
evidence narrowed to the scope's book before revenue and counts; titles
gated exactly as before; no scope, no change."""

from services.brain.tests.customers_fixtures import CustomersFixture

LIST = "/api/v1/anomalies/"
STORED = "Login fails for Pizza Hut and Taco Bell after the SSO change"


class AnomalyScopeTests(CustomersFixture):
    def setUp(self):
        self.outage = self.anomaly(STORED, self.pizza, self.taco, self.east, self.soup)
        self.billing = self.anomaly("Invoices doubled at Taco Bell", self.taco)

    def rows(self, user, query=""):
        response = self.as_user(user).get(f"{LIST}{query}")
        self.assertEqual(response.status_code, 200, response.json())
        return {row["id"]: row for row in response.json()}

    def test_without_a_scope_the_list_is_the_readers_as_before(self):
        rows = self.rows(self.csm)
        self.assertEqual(set(rows), {self.outage.id, self.billing.id})
        outage = rows[self.outage.id]
        self.assertEqual(outage["title"], "Similar reports across 2 of your companies")
        self.assertEqual(float(outage["arr"]), 500000.0)

    def test_me_narrows_to_the_readers_book_and_keeps_the_title_gate(self):
        rows = self.rows(self.csm, "?scope=me")
        self.assertEqual(list(rows), [self.outage.id])
        outage = rows[self.outage.id]
        self.assertEqual(outage["title"], "Similar reports across 1 of your companies")
        self.assertIsNone(outage["summary"])
        self.assertEqual(float(outage["arr"]), 300000.0)
        self.assertEqual((outage["companies"], outage["interactions"]), (1, 2))

    def test_my_team_is_the_managers_and_their_reports_books(self):
        outage = self.rows(self.mona, "?scope=team")[self.outage.id]
        self.assertEqual(float(outage["arr"]), 350000.0)
        self.assertEqual((outage["companies"], outage["interactions"]), (2, 3))

    def test_company_for_view_all_is_the_unscoped_list_with_stored_titles(self):
        company = self.rows(self.admin, "?scope=company")
        self.assertEqual(company, self.rows(self.admin))
        self.assertEqual(company[self.outage.id]["title"], STORED)

    def test_an_empty_book_lists_nothing(self):
        # Alice owns nothing, so her Me is empty.
        self.assertEqual(self.rows(self.admin, "?scope=me"), {})

    def test_a_scope_the_reader_may_not_use_is_refused(self):
        response = self.as_user(self.csm).get(f"{LIST}?scope=team")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "SCOPE_NOT_ALLOWED")

    def test_the_detail_is_narrowed_and_404s_when_nothing_is_left(self):
        client = self.as_user(self.csm)
        gone = client.get(f"{LIST}{self.billing.id}/?scope=me")
        self.assertEqual(gone.status_code, 404)
        self.assertEqual(gone.json(), {"detail": "No reports you can read."})
        detail = client.get(f"{LIST}{self.outage.id}/?scope=me").json()
        self.assertEqual([c["name"] for c in detail["companies_hit"]], ["Pizza Hut"])
        self.assertEqual(len(detail["evidence"]), 2)

    def test_a_patch_answers_with_the_unscoped_detail(self):
        response = self.as_user(self.admin).patch(
            f"{LIST}{self.billing.id}/?scope=me", {"status": "acknowledged"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.json())
        self.assertEqual(response.json()["status"], "acknowledged")

    def test_a_scope_the_reader_may_not_use_is_refused_on_detail(self):
        response = self.as_user(self.csm).get(f"{LIST}{self.outage.id}/?scope=team")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "SCOPE_NOT_ALLOWED")

    def test_an_account_whose_parent_is_outside_the_book_reads_as_your_accounts(self):
        # Taco East is Carl's own account, in his Me book, but its parent
        # Taco Bell is Dana's, outside it: the evidence is in, but no
        # company is behind it, so the built title must not say "0".
        east_only = self.anomaly("Carl's Taco East outage", self.east)
        rows = self.rows(self.csm, "?scope=me")
        row = rows[east_only.id]
        self.assertEqual(row["title"], "Similar reports on your accounts")
        self.assertEqual((row["companies"], float(row["arr"])), (0, 0.0))
