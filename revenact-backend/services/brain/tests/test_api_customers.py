"""GET /api/v1/brain/customers/?scope= over HTTP (Brain delivery 4 spec
§1.5, §3): any member, their own scope only, nothing of another tenant's."""

from services.brain.tests.customers_fixtures import CustomersFixture

CUSTOMERS = "/api/v1/brain/customers/"


class CustomersApiTests(CustomersFixture):
    def test_a_member_reads_their_me(self):
        self.feature("SSO with Okta", self.pizza)
        response = self.as_user(self.csm).get(f"{CUSTOMERS}?scope=me")
        self.assertEqual(response.status_code, 200, response.json())
        body = response.json()
        self.assertEqual(body["scope"], "me")
        self.assertEqual([row["title"] for row in body["asks"]["top"]], ["SSO with Okta"])
        self.assertEqual(body["asks"]["top"][0]["arr"], 300000.0)
        self.assertEqual(
            body["sentiment"], {"negative": 0, "tracking_since": None, "turned_negative": []}
        )

    def test_the_default_scope_is_the_widest(self):
        self.assertEqual(self.as_user(self.mona).get(CUSTOMERS).json()["scope"], "team")
        self.assertEqual(self.as_user(self.admin).get(CUSTOMERS).json()["scope"], "company")

    def test_a_scope_the_reader_may_not_use_is_refused(self):
        response = self.as_user(self.csm).get(f"{CUSTOMERS}?scope=company")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "SCOPE_NOT_ALLOWED")
        self.assertEqual(self.as_user(self.csm).get(f"{CUSTOMERS}?scope=x").status_code, 400)

    def test_signed_out_is_refused(self):
        self.assertEqual(self.client.get(CUSTOMERS).status_code, 401)

    def test_another_tenant_sees_nothing_of_ours(self):
        self.feature("SSO with Okta", self.pizza)
        self.answer(self.send("nps"), self.pizza, 10, comment="Great.")
        body = self.as_user(self.stranger).get(f"{CUSTOMERS}?scope=me").json()
        self.assertEqual(body["asks"], {"total": 0, "top": []})
        self.assertEqual((body["scores"]["comments"], body["scores"]["hidden"]), ([], 0))

    def test_sentiment_changed_at_is_iso_8601_over_the_wire(self):
        self.turned(self.contact(self.pizza, "Nia New"), "neutral", days_ago=1)
        body = self.as_user(self.csm).get(f"{CUSTOMERS}?scope=me").json()
        (turned,) = body["sentiment"]["turned_negative"]
        self.assertRegex(turned["changed_at"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")
