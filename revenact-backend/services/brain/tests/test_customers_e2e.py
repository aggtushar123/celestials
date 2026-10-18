"""End to end over HTTP: the journeys the plan names. A CSM sees only their
book's asks and scores and their manager sees the team's; comments on
records a reader can't open are counted, never named; a contact turned
negative by a hand edit shows up; the scoped graph is open to a member; and
?scope= on /requests/ and /anomalies/ narrows while no scope is unchanged."""

from django.utils import timezone

from services.brain.tests.customers_fixtures import CustomersFixture

CUSTOMERS = "/api/v1/brain/customers/"


class CustomersEndToEndTests(CustomersFixture):
    def page(self, user, key):
        response = self.as_user(user).get(f"{CUSTOMERS}?scope={key}")
        self.assertEqual(response.status_code, 200, response.json())
        return response.json()

    def test_a_csm_sees_their_books_asks_and_scores_and_their_manager_the_teams(self):
        self.feature("SSO with Okta", self.pizza, self.soup)
        self.feature("Soup recipes API", self.soup)
        self.feature("Taco export", self.taco)
        csat = self.send("csat")
        self.answers(csat, self.pizza, [5, 5, 5, 5, 5])
        self.answers(csat, self.soup, [1, 1, 1, 1, 1])

        carl = self.page(self.csm, "me")
        self.assertEqual([row["title"] for row in carl["asks"]["top"]], ["SSO with Okta"])
        self.assertEqual(carl["asks"]["top"][0]["arr"], 300000.0)
        self.assertEqual(carl["scores"]["csat"]["now"], 100.0)
        self.assertEqual(carl["scores"]["csat"]["responses"], 5)

        mona = self.page(self.mona, "team")
        self.assertEqual(
            [row["title"] for row in mona["asks"]["top"]], ["SSO with Okta", "Soup recipes API"]
        )
        self.assertEqual(mona["asks"]["top"][0]["arr"], 350000.0)
        self.assertEqual(mona["scores"]["csat"]["now"], 50.0)
        self.assertEqual(mona["scores"]["csat"]["responses"], 10)

    def test_comments_on_records_the_reader_cant_open_are_counted_not_named(self):
        nps = self.send("nps")
        self.answer(nps, self.pizza, 3, comment="Support is slow lately.")
        self.answer(nps, self.loose, 10, comment="Lovely team.")
        scores = self.page(self.lee, "company")["scores"]
        self.assertEqual([c["comment"] for c in scores["comments"]], ["Lovely team."])
        self.assertEqual(scores["hidden"], 1)
        everything = self.page(self.admin, "company")["scores"]
        self.assertEqual(len(everything["comments"]), 2)
        self.assertEqual(everything["hidden"], 0)

    def test_a_contact_turned_negative_by_hand_is_listed(self):
        olivia = self.contact(self.pizza, "Olivia Park")
        before = self.page(self.csm, "me")["sentiment"]
        self.assertEqual(before, {"negative": 0, "tracking_since": None, "turned_negative": []})
        response = self.as_user(self.csm).patch(
            f"/api/v1/contacts/{olivia.id}/", {"sentiment": "negative"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        after = self.page(self.csm, "me")["sentiment"]
        self.assertEqual(after["negative"], 1)
        self.assertEqual(after["tracking_since"], timezone.localdate().isoformat())
        (row,) = after["turned_negative"]
        self.assertEqual(row["contact"], {"id": olivia.id, "name": "Olivia Park"})
        self.assertEqual(
            row["record"], {"type": "customer", "id": self.pizza.id, "name": "Pizza Hut"}
        )
        self.assertEqual(row["previous"], "neutral")
        # Dana's Me holds none of it.
        self.assertEqual(self.page(self.other, "me")["sentiment"]["turned_negative"], [])

    def test_the_scoped_graph_is_open_to_a_member(self):
        response = self.as_user(self.other).get("/api/v1/brain/graph/?scope=me")
        self.assertEqual(response.status_code, 200, response.json())
        customers = {n["label"] for n in response.json()["nodes"] if n["kind"] == "customer"}
        self.assertEqual(customers, {"Taco Bell"})
        self.assertEqual(self.as_user(self.other).get("/api/v1/metrics/graph/").status_code, 403)

    def test_scope_narrows_requests_and_anomalies_while_no_scope_is_unchanged(self):
        self.feature("Taco export", self.taco, self.east)
        self.anomaly("Invoices doubled at Taco Bell", self.taco)
        client = self.as_user(self.csm)
        # Without a scope Carl reads Taco Bell through his Taco East.
        self.assertEqual(
            [r["title"] for r in client.get("/api/v1/requests/").json()], ["Taco export"]
        )
        self.assertEqual(len(client.get("/api/v1/anomalies/").json()), 1)
        (scoped,) = client.get("/api/v1/requests/?scope=me").json()
        self.assertEqual((scoped["interactions"], float(scoped["arr"])), (1, 0.0))
        self.assertEqual(client.get("/api/v1/anomalies/?scope=me").json(), [])
        page = self.page(self.csm, "me")
        self.assertEqual(page["asks"]["total"], 1)
        self.assertEqual(page["anomalies"], {"total": 0, "top": []})
