"""Jira projects for a jira.create step that has none: the account's
Administer right, a key's being free, and a new Jira Software project led
by the account. Jira is a fake (`jira_fake`); the agents' tool turns its
refusals into sentences."""

from django.test import SimpleTestCase

from services.agents.outside import jira_projects, sentences, tools
from services.connectors.jira_links import Seat
from services.connectors.providers.jira import PROJECT_TEMPLATE, JiraProvider
from services.connectors.tests.jira_fake import use_jira

CONFIG = {"host": "acme.atlassian.net", "project": ""}
CREDS = {"email": "bot@acme.io", "api_token": "t"}


#: The connection's seat (no person's link).
SEAT = Seat(config=CONFIG, creds=CREDS, person=False, name="Jira Bot")


class JiraProjectProviderTests(SimpleTestCase):
    def setUp(self):
        self.api = use_jira(self)
        self.jira = JiraProvider()

    def test_administer_is_read_site_wide(self):
        self.assertFalse(self.jira.can_administer(CONFIG, CREDS))
        method, path, query, _ = self.api.calls[-1]
        self.assertEqual(
            (path, query), ("/rest/api/3/mypermissions", {"permissions": "ADMINISTER"})
        )
        self.api.permissions.add("ADMINISTER")
        self.assertTrue(self.jira.can_administer(CONFIG, CREDS))

    def test_a_key_in_use_is_not_free(self):
        self.assertFalse(self.jira.project_key_free(CONFIG, CREDS, "SUP"))
        self.assertTrue(self.jira.project_key_free(CONFIG, CREDS, "CE"))

    def test_a_project_is_made_led_by_the_account(self):
        lead = self.jira.myself(CONFIG, CREDS)["accountId"]
        key = self.jira.create_project(CONFIG, CREDS, key="CE", name="Escalations", lead=lead)
        self.assertEqual(key, "CE")
        method, path, _, body = self.api.calls[-1]
        self.assertEqual((method, path), ("POST", "/rest/api/3/project"))
        self.assertEqual(
            body,
            {
                "key": "CE",
                "name": "Escalations",
                "projectTypeKey": "software",
                "projectTemplateKey": PROJECT_TEMPLATE,
                "leadAccountId": "acc-bot",
                "assigneeType": "UNASSIGNED",
            },
        )


class JiraProjectToolTests(SimpleTestCase):
    def setUp(self):
        self.api = use_jira(self)
        self.tool = tools.JiraTool()
        self.connector = None

    def make(self, **kwargs):
        return self.tool.create_project(self.connector, **kwargs)

    def test_it_makes_the_project(self):
        made = self.make(key="CE", name="Escalations", seat=SEAT)
        self.assertEqual((made, self.api.projects["CE"]), ("CE", "Escalations"))

    def test_jiras_403_and_401_are_the_plain_sentence(self):
        for status in (401, 403):
            with self.subTest(status=status):
                self.api.refuse_next(r"POST /rest/api/3/project$", status)
                with self.assertRaises(tools.CantCreateProject) as caught:
                    self.tool.create_project(
                        self.connector, key="CE", name="Escalations", seat=SEAT
                    )
                self.assertEqual(caught.exception.sentence, jira_projects.CANT_CREATE)

    def test_a_key_in_use_is_its_field(self):
        with self.assertRaises(tools.ProjectTaken) as caught:
            self.make(key="SUP", name="Escalations", seat=SEAT)
        self.assertEqual(
            (caught.exception.field, caught.exception.sentence),
            ("key", sentences.PROJECT_KEY_TAKEN),
        )

    def test_a_lost_answer_is_unconfirmed(self):
        self.api.drop_next(r"POST /rest/api/3/project$")
        with self.assertRaises(tools.Unconfirmed):
            self.make(key="CE", name="Escalations", seat=SEAT)

    def test_who_may_create(self):
        self.assertFalse(self.tool.can_create_projects(self.connector, seat=SEAT))
        self.api.permissions.add("ADMINISTER")
        self.assertTrue(self.tool.can_create_projects(self.connector, seat=SEAT))
        self.api.refuse_next("mypermissions", 500)
        # Jira can't say: offered, and its refusal answers the create.
        self.assertTrue(self.tool.can_create_projects(self.connector, seat=SEAT))
