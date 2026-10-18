"""Jira steps and pick lists acting as the linked person, against Jira's REST
API in memory (fixes after the R2-D2 live test, contract "Fixes after the
live test"). The real JiraTool talks to FakeJiraApi, which answers a
person's Bearer token as Jira Cloud did live: `/priority/search` needs an
admin scope and refuses it with "scope does not match". Nothing leaves the
process."""

from django.test import SimpleTestCase, override_settings

from core.models import AuditEvent
from services.agents.outside import sentences, tools
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors.models import JiraLink
from services.connectors.providers.base import ProviderError
from services.connectors.tests.jira_fake import SCOPE_MISMATCH, use_jira

ON = {"ATLASSIAN_OAUTH_CLIENT_ID": "cid", "ATLASSIAN_OAUTH_CLIENT_SECRET": "secret"}
OPTIONS = "/api/v1/agents/bundles/{}/steps/{}/options/{}/"
STEP_SCOPE = "Your Jira link can't do this in Jira. Ask your Revenact admin, then Retry."
LIST_SCOPE = "Your Jira link can't do this in Jira."


@override_settings(**ON)
class JiraLiveFixTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.api = use_jira(self)
        # The real tool against the in-memory Jira API, in place of FakeJira.
        self.fakes.jira = tools.JiraTool()
        self.board = self.jira_connector(department="cs")
        self.ticket, self.thread = self.jira_thread(self.pizza, self.board)
        self.link = self.link_for(self.csm)

    def bundle_with(self, **payload):
        made = {**self.jira_payload(self.board), **payload}
        bundle = self.outside_bundle(self.thread, ("jira.create", made))
        return bundle, bundle.steps.get()

    def paths(self):
        return [path for _, path, _, _ in self.api.calls]

    def priority_paths(self):
        return [p for p in self.paths() if "priority" in p or p.count("/issuetypes/")]

    def run_step(self, **payload):
        bundle, step = self.bundle_with(**payload)
        self.assertEqual(self.run_all_steps(self.csm, bundle).status_code, 200)
        step.refresh_from_db()
        return step

    def test_a_create_with_no_priority_reads_no_priorities(self):
        step = self.run_step(priority=None)
        self.assertEqual(step.status, "applied", step.error)
        self.assertEqual(step.result["acted_as"], "person")
        self.assertEqual(self.priority_paths(), [])
        [key] = self.api.created
        self.assertNotIn("priority", self.api.issues[key]["fields"])

    def test_a_create_with_a_priority_name_reads_the_create_screen(self):
        step = self.run_step()
        self.assertEqual(step.status, "applied", step.error)
        self.assertEqual(
            self.priority_paths(), ["/rest/api/3/issue/createmeta/SUP/issuetypes/10001"]
        )
        [key] = self.api.created
        self.assertEqual(self.api.issues[key]["fields"]["priority"], {"id": "2"})

    def test_a_priority_the_create_screen_lacks_leaves_jiras_default(self):
        self.api.create_priorities["SUP"] = [{"id": "3", "name": "Medium"}]
        step = self.run_step()
        self.assertEqual(step.status, "applied", step.error)
        [key] = self.api.created
        self.assertNotIn("priority", self.api.issues[key]["fields"])

    def test_a_picked_priority_is_sent_without_a_read(self):
        step = self.run_step(priority={"id": "4", "name": "Low"})
        self.assertEqual(step.status, "applied", step.error)
        self.assertEqual(self.priority_paths(), [])
        [key] = self.api.created
        self.assertEqual(self.api.issues[key]["fields"]["priority"], {"id": "4"})

    def test_a_scope_mismatch_says_so_and_keeps_the_link(self):
        self.api.refuse_next(r"POST /rest/api/3/issue$", 401, SCOPE_MISMATCH)
        step = self.run_step()
        self.assertEqual((step.status, step.error), ("failed", STEP_SCOPE))
        self.assertNotIn("Link Jira again", step.error)
        self.link.refresh_from_db()
        self.assertEqual(self.link.status, JiraLink.Status.LINKED)
        self.assertFalse(AuditEvent.objects.filter(action="jira.link_lost").exists())

    def test_a_plain_401_as_the_person_still_asks_to_link_again(self):
        self.api.refuse_next(r"POST /rest/api/3/issue$", 401)
        step = self.run_step()
        self.assertEqual(step.error, sentences.JIRA_LINK_REFUSED)
        self.link.refresh_from_db()
        self.assertEqual(self.link.status, JiraLink.Status.LINKED)

    # The pick list -------------------------------------------------------

    def options(self, step, name, user=None, **query):
        return self.client_for(user or self.csm).get(
            OPTIONS.format(step.bundle_id, step.pk, name), query
        )

    def test_priorities_for_a_project_and_type_come_from_its_create_screen(self):
        self.api.create_priorities["ENG"] = [{"id": "1", "name": "Highest"}]
        _, step = self.bundle_with()
        answer = self.options(step, "jira_priorities", project="ENG", issue_type="10002")
        self.assertEqual(
            (answer.status_code, answer.json()),
            (200, {"options": [{"id": "1", "name": "Highest", "detail": ""}], "more": False}),
        )
        self.assertEqual(
            self.priority_paths(), ["/rest/api/3/issue/createmeta/ENG/issuetypes/10002"]
        )

    def test_priorities_default_to_the_steps_project_and_picked_type(self):
        _, step = self.bundle_with(issue_type={"id": "10002", "name": "Bug"})
        answer = self.options(step, "jira_priorities")
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertEqual(
            self.priority_paths(), ["/rest/api/3/issue/createmeta/SUP/issuetypes/10002"]
        )

    def test_another_project_without_a_type_never_uses_the_steps_type(self):
        _, step = self.bundle_with(issue_type={"id": "10001", "name": "Task"})
        self.options(step, "jira_priorities", project="ENG")
        self.assertEqual(self.priority_paths(), ["/rest/api/3/priority"])

    def test_without_a_type_a_person_reads_the_list_their_link_can(self):
        _, step = self.bundle_with()
        answer = self.options(step, "jira_priorities")
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertEqual(
            [p["name"] for p in answer.json()["options"]], ["Highest", "High", "Medium", "Low"]
        )
        self.assertEqual(self.priority_paths(), ["/rest/api/3/priority"])

    def test_without_a_type_the_connection_reads_priority_search(self):
        _, step = self.bundle_with()
        answer = self.options(step, "jira_priorities", user=self.admin)
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertEqual(self.priority_paths(), ["/rest/api/3/priority/search"])

    def test_an_issue_type_must_be_a_jira_id(self):
        _, step = self.bundle_with()
        for bad in ("abc", "1/2", "9" * 19):
            with self.subTest(bad=bad):
                answer = self.options(step, "jira_priorities", project="SUP", issue_type=bad)
                self.assertEqual(
                    (answer.status_code, answer.json()),
                    (400, {"issue_type": ["Choose from Jira's list."]}),
                )

    def test_a_list_jira_refuses_for_scope_says_the_link_cant(self):
        _, step = self.bundle_with()
        self.api.refuse_next(r"project/search", 401, SCOPE_MISMATCH)
        answer = self.options(step, "jira_projects")
        self.assertEqual(
            (answer.status_code, answer.json()),
            (409, {"code": "TOOL_REFUSED", "detail": LIST_SCOPE}),
        )
        self.link.refresh_from_db()
        self.assertEqual(self.link.status, JiraLink.Status.LINKED)

    def test_a_list_jira_forbids_as_the_person_never_asks_to_reconnect(self):
        _, step = self.bundle_with()
        self.api.refuse_next(r"project/search", 403)
        answer = self.options(step, "jira_projects")
        self.assertEqual(answer.json(), {"code": "TOOL_REFUSED", "detail": LIST_SCOPE})


class ScopeSentenceTests(SimpleTestCase):
    def refused(self, status, body=None):
        return ProviderError("x", status=status, body=body)

    def test_a_scope_mismatch_as_the_person_is_not_a_lost_link(self):
        scope = self.refused(401, SCOPE_MISMATCH)
        self.assertEqual(sentences.jira(scope, project="SUP", person=True), STEP_SCOPE)
        self.assertEqual(
            sentences.list_failure(scope, project="SUP", person=True),
            ("TOOL_REFUSED", LIST_SCOPE, 409),
        )

    def test_a_403_as_the_person_never_asks_to_reconnect(self):
        self.assertEqual(
            sentences.list_failure(self.refused(403), person=True),
            ("TOOL_REFUSED", LIST_SCOPE, 409),
        )
        self.assertEqual(
            sentences.jira(self.refused(403), issue="SUP-12", person=True),
            "Your Jira account can't do this in SUP-12. "
            "Ask a Jira admin for permission, then Retry.",
        )

    def test_any_other_401_keeps_todays_sentences(self):
        plain = self.refused(401, {"message": "Unauthorized"})
        self.assertEqual(sentences.jira(plain, person=True), sentences.JIRA_LINK_REFUSED)
        self.assertEqual(sentences.list_failure(plain, person=True)[1], sentences.LIST_LINK_REFUSED)
        # The connection's API token has no OAuth scopes: today's sentences.
        scope = self.refused(401, SCOPE_MISMATCH)
        self.assertEqual(sentences.jira(scope), sentences.JIRA_LOGIN)
        self.assertEqual(sentences.list_failure(scope)[1], sentences.LIST_REFUSED)


class CreateScreenReadTests(SimpleTestCase):
    def test_the_priority_field_is_found_on_a_later_page(self):
        from unittest.mock import patch

        from services.connectors.providers.jira import JiraProvider

        filler = [{"fieldId": f"customfield_{n}", "key": f"customfield_{n}"} for n in range(200)]
        pages = [
            {"fields": filler, "startAt": 0, "total": 201},
            {
                "fields": [
                    {"fieldId": "priority", "allowedValues": [{"id": "9", "name": "Urgent"}]}
                ],
                "startAt": 200,
                "total": 201,
            },
        ]
        with patch("services.connectors.providers.jira.http_json", side_effect=pages) as call:
            rows = JiraProvider().create_priorities(
                {"host": "acme.atlassian.net"}, {"access_token": "t"}, "SUP", "10001"
            )
        self.assertEqual(rows, [{"id": "9", "name": "Urgent", "detail": ""}])
        self.assertIn("startAt=200", call.call_args_list[1].args[1])

    def test_a_screen_without_a_priority_field_offers_none(self):
        from unittest.mock import patch

        from services.connectors.providers.jira import JiraProvider

        page = {"fields": [{"fieldId": "summary"}], "startAt": 0, "total": 1}
        with patch("services.connectors.providers.jira.http_json", return_value=page) as call:
            rows = JiraProvider().create_priorities(
                {"host": "acme.atlassian.net"}, {"access_token": "t"}, "SUP", "10001"
            )
        self.assertEqual((rows, call.call_count), ([], 1))
