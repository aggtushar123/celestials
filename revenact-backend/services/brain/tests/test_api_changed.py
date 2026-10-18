"""`scopes/` and `changed/` over HTTP: §4's shapes and refusals."""

from rest_framework.test import APIClient

from services.brain.tests.fixtures import BrainFixture

SCOPES = "/api/v1/brain/scopes/"
CHANGED = "/api/v1/brain/changed/"


class ScopesApiTests(BrainFixture):
    def test_each_reader_gets_their_scopes_and_default(self):
        self.assertEqual(
            self.as_user(self.mona).get(SCOPES).json(),
            {
                "scopes": [{"key": "me", "label": "Me"}, {"key": "team", "label": "My team"}],
                "default": "team",
            },
        )
        self.assertEqual(
            self.as_user(self.lee).get(SCOPES).json(),
            {
                "scopes": [{"key": "me", "label": "Me"}, {"key": "company", "label": "Company"}],
                "default": "company",
            },
        )
        self.assertEqual(self.as_user(self.csm).get(SCOPES).json()["default"], "me")

    def test_anonymous_is_refused(self):
        self.assertEqual(APIClient().get(SCOPES).status_code, 401)


class ChangedApiTests(BrainFixture):
    def test_scope_refusals(self):
        client = self.as_user(self.csm)
        response = client.get(f"{CHANGED}?scope=team")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(), {"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}
        )
        response = client.get(f"{CHANGED}?scope=everyone")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(), {"code": "SCOPE_UNKNOWN", "detail": "Choose me, team or company."}
        )

    def test_no_scope_reads_the_default(self):
        self.assertEqual(self.as_user(self.mona).get(CHANGED).json()["scope"], "team")
        self.assertEqual(self.as_user(self.mona).get(f"{CHANGED}?scope=").json()["scope"], "team")

    def test_the_contract_shape(self):
        body = self.as_user(self.lee).get(f"{CHANGED}?scope=company").json()
        self.assertEqual(
            set(body),
            {
                "scope",
                "as_of",
                "since",
                "since_kind",
                "team_changed_on",
                "currency",
                "empty",
                "metrics",
                "signals",
            },
        )
        self.assertEqual(body["as_of"], self.today.isoformat())

    def test_another_tenant_reads_only_its_own_book(self):
        body = self.as_user(self.stranger).get(f"{CHANGED}?scope=me").json()
        arr = next(m for m in body["metrics"] if m["key"] == "active_arr")
        self.assertEqual(arr["now"], 999_000.0)
