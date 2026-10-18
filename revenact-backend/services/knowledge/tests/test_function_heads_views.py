"""Slack escalations D2 contract §2, SE2-5, SE2-6, SE2-8: any member reads
the heads; an organisation-settings manager names them; every refusal in
plain words; every real change audited."""

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.accounts.models import User
from services.knowledge.models import FunctionHead
from services.knowledge.tests.heads_fixtures import HeadsFixture

URL = "/api/v1/function-heads/"
FUNCTION_HEADS_QUERIES = 1


class FunctionHeadsViewTests(HeadsFixture):
    def heads_by_function(self, answer):
        return {row["function"]: row["user"] for row in answer.json()}

    def test_any_member_reads_the_six_functions(self):
        FunctionHead.objects.create(organisation=self.org, function="engineering", user=self.jesh)
        answer = self.as_(self.carl).get(URL)
        self.assertEqual(answer.status_code, 200)
        self.assertEqual(len(answer.json()), 6)
        self.assertEqual(
            answer.json()[1],
            {
                "function": "engineering",
                "function_display": "Engineering",
                "user": {"id": self.jesh.id, "name": "Jesh Sanghvi"},
            },
        )
        self.assertNotIn("email", str(answer.json()))

    def test_another_workspaces_heads_are_never_shown(self):
        FunctionHead.objects.create(
            organisation=self.elsewhere, function="engineering", user=self.zed
        )
        self.assertIsNone(self.heads_by_function(self.as_(self.alice).get(URL))["engineering"])

    def test_signed_out_is_refused(self):
        self.assertEqual(APIClient().get(URL).status_code, 401)
        self.assertEqual(
            APIClient().patch(URL, {"function": "cs", "user_id": None}, format="json").status_code,
            401,
        )

    def test_naming_a_head_needs_organisation_settings(self):
        answer = self.as_(self.carl).patch(
            URL, {"function": "engineering", "user_id": self.jesh.id}, format="json"
        )
        self.assertEqual(answer.status_code, 403)
        self.assertEqual(
            answer.json(), {"detail": "You don't have permission to change organisation settings."}
        )
        self.assertFalse(FunctionHead.objects.exists())
        self.assertFalse(AuditEvent.objects.filter(action="function_head.changed").exists())

    def test_an_admin_names_replaces_and_clears_a_head(self):
        api = self.as_(self.alice)
        named = api.patch(URL, {"function": "engineering", "user_id": self.jesh.id}, format="json")
        self.assertEqual(named.status_code, 200)
        self.assertEqual(
            self.heads_by_function(named)["engineering"],
            {"id": self.jesh.id, "name": "Jesh Sanghvi"},
        )
        replaced = api.patch(
            URL, {"function": "engineering", "user_id": self.erin.id}, format="json"
        )
        self.assertEqual(self.heads_by_function(replaced)["engineering"]["id"], self.erin.id)
        cleared = api.patch(URL, {"function": "engineering", "user_id": None}, format="json")
        self.assertIsNone(self.heads_by_function(cleared)["engineering"])
        events = list(AuditEvent.objects.filter(action="function_head.changed").order_by("id"))
        self.assertEqual(
            [e.metadata for e in events],
            [
                {"function": "engineering", "from": None, "to": self.jesh.id},
                {"function": "engineering", "from": self.jesh.id, "to": self.erin.id},
                {"function": "engineering", "from": self.erin.id, "to": None},
            ],
        )
        self.assertTrue(all(e.actor_id == self.alice.id for e in events))
        self.assertTrue(all(e.target_id == str(self.org.id) for e in events))

    def test_naming_the_same_head_again_writes_no_audit_row(self):
        api = self.as_(self.alice)
        for _ in range(2):
            api.patch(URL, {"function": "engineering", "user_id": self.jesh.id}, format="json")
        self.assertEqual(AuditEvent.objects.filter(action="function_head.changed").count(), 1)

    def test_refusals_in_plain_words(self):
        api = self.as_(self.alice)
        User.objects.filter(pk=self.erin.pk).update(is_active=False)
        cases = [
            ({"user_id": self.jesh.id}, {"function": ["This field is required."]}),
            (
                {"function": "finance", "user_id": self.jesh.id},
                {"function": ['"finance" is not a valid choice.']},
            ),
            ({"function": "engineering"}, {"user_id": ["This field is required."]}),
            ({"function": "engineering", "user_id": self.zed.id}, {"user_id": ["No such member."]}),
            ({"function": "engineering", "user_id": 999999}, {"user_id": ["No such member."]}),
            (
                {"function": "engineering", "user_id": self.erin.id},
                {"user_id": ["Erin Engineer is deactivated. Pick an active member."]},
            ),
            (
                {"function": "engineering", "user_id": self.faiz.id},
                {
                    "user_id": [
                        "Faiz Jamal is in Customer Success, not Engineering. "
                        "Pick someone from Engineering."
                    ]
                },
            ),
        ]
        for body, refusal in cases:
            with self.subTest(body=body):
                answer = api.patch(URL, body, format="json")
                self.assertEqual(answer.status_code, 400)
                self.assertEqual(answer.json(), refusal)
        self.assertFalse(FunctionHead.objects.exists())
        self.assertFalse(AuditEvent.objects.filter(action="function_head.changed").exists())

    def test_reading_is_one_query_whatever_the_heads(self):
        api = self.as_(self.carl)
        for user, function in ((None, None), (self.jesh, "engineering"), (self.faiz, "cs")):
            if user is not None:
                FunctionHead.objects.create(organisation=self.org, function=function, user=user)
            with CaptureQueriesContext(connection) as seen:
                self.assertEqual(api.get(URL).status_code, 200)
            self.assertEqual(len(seen), FUNCTION_HEADS_QUERIES, [q["sql"] for q in seen])
