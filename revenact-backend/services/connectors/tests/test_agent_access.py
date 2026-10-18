"""Each connector says what agents may do through it (agent bundles D3
contract §1.1, §4.3, D3-9)."""

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from services.accounts.models import Organisation, User
from services.connectors import agent_access
from services.connectors.models import Connector
from services.segments.tests.fixtures import person

CONNECTORS = "/api/v1/connectors/"


class AgentAccessTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organisation.objects.create(name="Acme Inc", currency="USD")
        cls.admin = person(
            "alice@acme.io",
            "Alice Admin",
            cls.org,
            role=User.Role.ADMIN,
            function=User.Function.LEADERSHIP,
        )

    def connector(self, provider, *, scopes=(), can_act=False, via="token", **fields):
        made = Connector.objects.create(
            organisation=self.org,
            provider=provider,
            name=f"{provider} {Connector.objects.count()}",
            status=Connector.Status.CONNECTED,
            config={"via": via} if provider == "slack" else {"host": "acme.atlassian.net"},
            granted_scopes=list(scopes),
            agents_can_act=can_act,
            **fields,
        )
        made.set_credentials({"bot_token": "xoxb-test"})
        made.save(update_fields=["credentials"])
        return made

    def test_slack_needs_chat_write_and_the_switch(self):
        slack = self.connector("slack", scopes=["channels:history"], can_act=True)
        self.assertEqual(agent_access.kinds(slack), ("slack.reply",))
        self.assertFalse(agent_access.can_act(slack))
        self.assertEqual(agent_access.needs(slack), "token")
        slack.granted_scopes = ["channels:history", "chat:write"]
        self.assertTrue(agent_access.can_act(slack))
        self.assertIsNone(agent_access.needs(slack))
        slack.agents_can_act = False
        self.assertFalse(agent_access.can_act(slack))

    @override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
    def test_slack_through_sign_in_asks_for_consent(self):
        slack = self.connector("slack", via="oauth")
        self.assertEqual(agent_access.needs(slack), "consent")

    def test_jira_needs_create_and_assign(self):
        jira = self.connector("jira", scopes=["CREATE_ISSUES"], can_act=True)
        self.assertEqual(agent_access.kinds(jira), ("jira.create", "jira.assign", "jira.comment"))
        self.assertEqual(agent_access.needs(jira), "permission")
        jira.granted_scopes = ["CREATE_ISSUES", "ASSIGN_ISSUES"]
        self.assertTrue(agent_access.can_act(jira))

    def test_a_disabled_or_failing_connector_cant_act(self):
        jira = self.connector(
            "jira", scopes=["CREATE_ISSUES", "ASSIGN_ISSUES"], can_act=True, is_enabled=False
        )
        self.assertFalse(agent_access.can_act(jira))
        jira.is_enabled, jira.status = True, Connector.Status.ERROR
        self.assertFalse(agent_access.can_act(jira))

    def test_zendesk_is_read_only_in_round_one(self):
        zendesk = self.connector("zendesk", can_act=True)
        self.assertEqual(agent_access.kinds(zendesk), ())
        self.assertFalse(agent_access.can_act(zendesk))
        self.assertIsNone(agent_access.needs(zendesk))

    def test_the_list_carries_the_agents_block(self):
        self.connector("zendesk")
        slack = self.connector(
            "slack",
            scopes=["chat:write"],
            can_act=True,
            agents_allowed_by=self.admin,
            agents_allowed_at=timezone.now(),
        )
        self.client.force_authenticate(self.admin)
        rows = {row["id"]: row for row in self.client.get(CONNECTORS).json()}
        block = rows[slack.pk]["agents"]
        self.assertEqual(
            {k: block[k] for k in ("kinds", "can_act", "needs", "allowed_by")},
            {
                "kinds": ["slack.reply"],
                "can_act": True,
                "needs": None,
                "allowed_by": {"id": self.admin.pk, "name": "Alice Admin"},
            },
        )
        self.assertIsNotNone(block["allowed_at"])
        self.assertNotIn("granted_scopes", rows[slack.pk])

    @override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
    def test_a_connector_that_cant_be_used_needs_a_reconnect_first(self):
        # Round 2 D1 contract R2D1-10: before consent, token or permission.
        slack = self.connector("slack", via="oauth", is_enabled=False)
        self.assertEqual(agent_access.needs(slack), "reconnect")
        slack.is_enabled, slack.status = True, Connector.Status.ERROR
        self.assertEqual(agent_access.needs(slack), "reconnect")
        jira = self.connector("jira", scopes=["CREATE_ISSUES"])
        jira.status = Connector.Status.ERROR
        self.assertEqual(agent_access.needs(jira), "reconnect")
        jira.status = Connector.Status.CONNECTED
        self.assertEqual(agent_access.needs(jira), "permission")
