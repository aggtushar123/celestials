"""Jira for agent bundles D3 (contract §2.3, §2.4, §5.2, §5.3, D3-5 to
D3-7, D3-11, D3-26). Jira is a fake."""

from django.test import SimpleTestCase

from services.connectors.providers.base import NoAnswer, ProviderError
from services.connectors.providers.jira import (
    LABEL_PREFIX,
    JiraProvider,
    adf,
    comment_url,
    issue_url,
)
from services.connectors.tests.jira_fake import use_jira

CONFIG = {"host": "acme.atlassian.net", "project": "SUP"}
CREDS = {"email": "bot@acme.io", "api_token": "t"}


class JiraActionTests(SimpleTestCase):
    def setUp(self):
        self.api = use_jira(self)
        self.jira = JiraProvider()

    def test_connect_names_the_account(self):
        config, _ = self.jira.connect(
            {"site": "acme", "email": "bot@acme.io", "api_token": "t", "project": "sup"}
        )
        self.assertEqual(
            config, {"host": "acme.atlassian.net", "project": "SUP", "account_name": "Jira Bot"}
        )

    def test_permissions_are_checked_on_the_project(self):
        self.api.permissions = {"CREATE_ISSUES"}
        held = self.jira.my_permissions(CONFIG, CREDS, ("CREATE_ISSUES", "ASSIGN_ISSUES"))
        self.assertEqual(held, {"CREATE_ISSUES"})
        method, path, query, _ = self.api.calls[-1]
        self.assertEqual(query["projectKey"], "SUP")

    def test_the_pick_lists(self):
        projects, more = self.jira.projects(CONFIG, CREDS, "sup")
        self.assertEqual(
            (projects, more), ([{"id": "SUP", "name": "Support", "detail": "SUP"}], False)
        )
        self.assertEqual(
            self.jira.issue_types(CONFIG, CREDS, "SUP"),
            [
                {"id": "10001", "name": "Task", "detail": ""},
                {"id": "10002", "name": "Bug", "detail": ""},
            ],
        )
        self.assertEqual(
            self.jira.priorities(CONFIG, CREDS)[0], {"id": "2", "name": "High", "detail": ""}
        )
        self.assertEqual(
            self.jira.assignable(CONFIG, CREDS, project="SUP", query="p"),
            [{"id": "acc-priya", "name": "Priya Shah", "detail": "priya@acme.io"}],
        )
        self.assertEqual(
            self.jira.user_by_email(CONFIG, CREDS, "erin@acme.io")["accountId"], "acc-erin"
        )
        self.assertIsNone(self.jira.user_by_email(CONFIG, CREDS, "nobody@acme.io"))

    def test_create_find_and_assign(self):
        key = self.jira.create_issue(
            CONFIG,
            CREDS,
            fields={
                "project": {"key": "SUP"},
                "issuetype": {"id": "10002"},
                "summary": "Login loop after reset",
                "description": adf("Since Monday.", "Created by Carl CSM from Revenact."),
                "labels": [f"{LABEL_PREFIX}b12-s41"],
            },
        )
        self.assertEqual(self.jira.find_issue(CONFIG, CREDS, label=f"{LABEL_PREFIX}b12-s41"), key)
        self.assertIsNone(self.jira.find_issue(CONFIG, CREDS, label=f"{LABEL_PREFIX}b12-s99"))
        self.assertIsNone(self.jira.issue_assignee(CONFIG, CREDS, key))
        self.jira.assign_issue(CONFIG, CREDS, key, "acc-priya")
        self.assertEqual(self.jira.issue_assignee(CONFIG, CREDS, key), "acc-priya")
        self.assertEqual(issue_url(CONFIG, key), f"https://acme.atlassian.net/browse/{key}")

    def test_a_lost_create_is_no_answer_and_the_issue_exists(self):
        self.api.drop_next(r"POST /rest/api/3/issue$")
        with self.assertRaises(NoAnswer):
            self.jira.create_issue(
                CONFIG,
                CREDS,
                fields={
                    "project": {"key": "SUP"},
                    "issuetype": {"id": "10001"},
                    "summary": "S",
                    "labels": ["revenact-b1-s2"],
                },
            )
        self.assertIsNotNone(self.jira.find_issue(CONFIG, CREDS, label="revenact-b1-s2"))

    def test_a_refusal_keeps_jiras_errors(self):
        self.api.refuse_next(
            r"POST /rest/api/3/issue$", 400, {"errors": {"components": "Component/s is required."}}
        )
        with self.assertRaises(ProviderError) as caught:
            self.jira.create_issue(CONFIG, CREDS, fields={"project": {"key": "SUP"}})
        self.assertEqual(
            (caught.exception.status, caught.exception.body["errors"]),
            (400, {"components": "Component/s is required."}),
        )

    def test_adf_paragraphs_line_breaks_and_the_footer(self):
        self.assertEqual(
            adf("First line\nsecond line\n\nNew paragraph", "Created by Carl CSM from Revenact."),
            {
                "type": "doc",
                "version": 1,
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {"type": "text", "text": "First line"},
                            {"type": "hardBreak"},
                            {"type": "text", "text": "second line"},
                        ],
                    },
                    {"type": "paragraph", "content": [{"type": "text", "text": "New paragraph"}]},
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": "Created by Carl CSM from Revenact."}],
                    },
                ],
            },
        )

    def test_an_issue_revenact_made_is_marked(self):
        made = self.jira._ticket(
            "acme.atlassian.net",
            {"key": "SUP-7", "fields": {"summary": "S", "labels": ["revenact-b1-s2"]}},
        )
        other = self.jira._ticket(
            "acme.atlassian.net",
            {"key": "SUP-8", "fields": {"summary": "S", "labels": ["customer"]}},
        )
        self.assertEqual((made.extra.get("made_here"), other.extra.get("made_here")), (True, None))

    def test_a_comment_is_internal_and_found_by_its_marker(self):
        # Round 2 D1 contract §2, R2D1-3, R2D1-4.
        body = adf("Seen on Chrome too.", "Posted by Carl CSM from Revenact · ref b12-s41.")
        comment = self.jira.add_comment(CONFIG, CREDS, "SUP-12", body=body)
        method, path, _, sent = self.api.calls[-1]
        self.assertEqual((method, path), ("POST", "/rest/api/3/issue/SUP-12/comment"))
        self.assertEqual(
            sent["properties"], [{"key": "sd.public.comment", "value": {"internal": True}}]
        )
        self.assertEqual(
            self.jira.find_comment(CONFIG, CREDS, "SUP-12", marker="ref b12-s41"), comment
        )
        self.assertIsNone(self.jira.find_comment(CONFIG, CREDS, "SUP-12", marker="ref b12-s99"))
        _, path, query, _ = self.api.calls[-1]
        self.assertEqual(
            (path, query["orderBy"], query["maxResults"]),
            ("/rest/api/3/issue/SUP-12/comment", "-created", "100"),
        )
        self.assertEqual(
            comment_url(CONFIG, "SUP-12", comment),
            f"https://acme.atlassian.net/browse/SUP-12?focusedCommentId={comment}",
        )

    def test_a_ref_is_not_found_inside_a_longer_ref(self):
        self.jira.add_comment(CONFIG, CREDS, "SUP-12", body=adf("Hi", "ref b1-s20."))
        self.assertIsNone(self.jira.find_comment(CONFIG, CREDS, "SUP-12", marker="ref b1-s2"))

    def test_a_lost_comment_is_no_answer_and_exists(self):
        self.api.drop_next(r"POST /rest/api/3/issue/SUP-12/comment$")
        with self.assertRaises(NoAnswer):
            self.jira.add_comment(CONFIG, CREDS, "SUP-12", body=adf("Hi", "ref b1-s2."))
        self.assertIsNotNone(self.jira.find_comment(CONFIG, CREDS, "SUP-12", marker="ref b1-s2"))

    def test_a_comment_on_a_missing_issue_is_a_404(self):
        with self.assertRaises(ProviderError) as caught:
            self.jira.add_comment(CONFIG, CREDS, "SUP-999", body=adf("Hi"))
        self.assertEqual(caught.exception.status, 404)

    def test_a_remote_link_carries_its_global_id(self):
        # Slack escalations D4, SE4-8: the issue links back to its Slack thread.
        url = "https://slack.com/archives/C0SUPPORT/p1760339999000100"
        self.jira.add_remote_link(
            CONFIG,
            CREDS,
            "SUP-12",
            url=url,
            title="Slack: #support thread",
            global_id="revenact-slack-7",
        )
        self.assertEqual(
            self.api.remote_links,
            [
                (
                    "SUP-12",
                    {
                        "globalId": "revenact-slack-7",
                        "object": {"url": url, "title": "Slack: #support thread"},
                    },
                )
            ],
        )
        with self.assertRaises(ProviderError) as caught:
            self.jira.add_remote_link(
                CONFIG, CREDS, "SUP-999", url=url, title="t", global_id="revenact-slack-7"
            )
        self.assertEqual(caught.exception.status, 404)


class JiraSeatTests(SimpleTestCase):
    """Round 2 D2 contract R2D2-5: a person's seat calls api.atlassian.com
    with their Bearer token; the connection's stays on the site with Basic."""

    def setUp(self):
        self.jira = use_jira(self)

    def test_the_person_seat_calls_through_api_atlassian_com(self):
        from services.connectors.jira_links import api_base

        config = {"host": "acme.atlassian.net", "project": "SUP", "api_base": api_base("cloud-1")}
        key = JiraProvider().create_issue(
            config,
            {"access_token": "at-7"},
            fields={
                "project": {"key": "SUP"},
                "issuetype": {"id": "10001"},
                "summary": "x",
                "labels": [],
            },
        )
        self.assertEqual(self.jira.callers, ["Bearer at-7"])
        self.assertEqual(
            self.jira.urls[-1], "https://api.atlassian.com/ex/jira/cloud-1/rest/api/3/issue"
        )
        self.assertEqual(issue_url(config, key), f"https://acme.atlassian.net/browse/{key}")

    def test_the_connection_seat_keeps_basic_auth_on_the_site(self):
        JiraProvider().priorities(
            {"host": "acme.atlassian.net"}, {"email": "b@acme.io", "api_token": "t"}
        )
        self.assertEqual(self.jira.callers, ["basic"])
        self.assertTrue(
            self.jira.urls[-1].startswith("https://acme.atlassian.net/rest/api/3/priority/search")
        )
