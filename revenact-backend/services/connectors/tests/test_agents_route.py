"""Allow agents to act (agent bundles D3 contract §5.3, §5.4, D3-9, D3-22).
Slack and Jira are fakes."""

from urllib.parse import parse_qs, urlsplit

from django.test import override_settings
from rest_framework.test import APITestCase

from core.models import AuditEvent
from services.accounts.models import Organisation, User
from services.connectors.models import Connector
from services.connectors.tests.jira_fake import use_jira
from services.connectors.tests.slack_fake import BASE_SCOPES, FakeSlackApi, use_slack
from services.segments.tests.fixtures import person

AGENTS = "/api/v1/connectors/{}/agents/"
CALLBACK = "/api/v1/connectors/oauth/slack/callback/"


class AgentsRouteTests(APITestCase):
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
        cls.csm = person("carl@acme.io", "Carl CSM", cls.org)

    def make(self, provider, *, via="token", config=None, **fields):
        made = Connector.objects.create(
            organisation=self.org,
            provider=provider,
            name=f"{provider} {Connector.objects.count()}",
            status=Connector.Status.CONNECTED,
            config=config
            or (
                {"channel": "C0SUPPORT", "channel_name": "support", "team_id": "T0ACME", "via": via}
                if provider == "slack"
                else {"host": "acme.atlassian.net", "project": "SUP", "account_name": "Jira Bot"}
            ),
            **fields,
        )
        made.set_credentials(
            {"bot_token": "xoxb-test"}
            if provider == "slack"
            else {"email": "bot@acme.io", "api_token": "t"}
        )
        made.save(update_fields=["credentials"])
        return made

    def sign_out_keeping_cookies(self):
        """force_authenticate(None) clears the client's cookies; the public
        callback must still arrive with the starting browser's."""
        cookies = self.client.cookies
        self.client.force_authenticate(None)
        self.client.cookies = cookies

    def post(self, connector, body, user=None):
        self.client.force_authenticate(user or self.admin)
        return self.client.post(AGENTS.format(connector.pk), body, format="json")

    def test_only_integration_managers_may_switch(self):
        slack = self.make("slack")
        self.assertEqual(self.post(slack, {"can_act": True}, self.csm).status_code, 403)

    def test_refusals(self):
        slack = self.make("slack")
        self.assertEqual(
            self.post(slack, {"can_act": "yes"}).json(), {"can_act": ["Choose on or off."]}
        )
        zendesk = self.make("zendesk", config={})
        self.assertEqual(
            self.post(zendesk, {"can_act": True}).json(),
            {"code": "NO_AGENT_KINDS", "detail": "Agents can't act in Zendesk yet."},
        )
        off = self.make("slack", is_enabled=False)
        self.assertEqual(
            self.post(off, {"can_act": True}).json(),
            {"code": "NOT_CONNECTED", "detail": "Connect Slack first."},
        )

    def test_a_token_that_can_post_switches_on(self):
        use_slack(self, FakeSlackApi(scopes=[*BASE_SCOPES, "chat:write"]))
        slack = self.make("slack")
        response = self.post(slack, {"can_act": True})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()["agents"]["can_act"])
        event = AuditEvent.objects.get(action="connector.agent_access")
        self.assertEqual(
            {k: event.metadata[k] for k in ("provider", "can_act", "was")},
            {"provider": "slack", "can_act": True, "was": False},
        )
        self.assertEqual(event.ip, "127.0.0.1")

    def test_a_token_that_cant_post_is_told_what_to_do(self):
        use_slack(self)
        slack = self.make("slack")
        response = self.post(slack, {"can_act": True})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json(),
            {
                "code": "SLACK_SCOPE_MISSING",
                "detail": "This Slack token can't post. Add chat:write to the Slack app, "
                "reinstall it, then reconnect with the new token.",
            },
        )
        slack.refresh_from_db()
        self.assertFalse(slack.agents_can_act)

    @override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
    def test_sign_in_asks_slack_for_consent_and_its_return_switches_on(self):
        api = use_slack(self)
        slack = self.make("slack", via="oauth")
        response = self.post(slack, {"can_act": True})
        self.assertEqual(response.status_code, 200, response.content)
        url = response.json()["authorize_url"]
        self.assertIn("chat%3Awrite", url)
        state = parse_qs(urlsplit(url).query)["state"][0]
        api.scopes = [*BASE_SCOPES, "chat:write"]
        self.sign_out_keeping_cookies()
        answer = self.client.get(CALLBACK, {"code": "c", "state": state})
        self.assertIn("connector=agents_on", answer["Location"])
        slack.refresh_from_db()
        self.assertTrue(slack.agents_can_act)
        self.assertIn("chat:write", slack.granted_scopes)
        self.assertEqual(slack.agents_allowed_by, self.admin)
        # I3: the consent records whose posts are ours on a connection made before it
        self.assertEqual((slack.config["bot_id"], slack.config["bot_user_id"]), ("B0BOT", "U0BOT"))
        consent = AuditEvent.objects.get(action="connector.agent_access")
        self.assertEqual(
            (consent.actor, consent.ip, consent.metadata),
            (
                self.admin,
                "127.0.0.1",
                {
                    "provider": "slack",
                    "can_act": True,
                    "was": False,
                    "scopes": slack.granted_scopes,
                },
            ),
        )

    @override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
    def test_a_consent_that_replaces_the_token_while_on_is_audited(self):
        api = use_slack(self)
        slack = self.make("slack", via="oauth", agents_can_act=True, agents_allowed_by=self.admin)
        response = self.post(slack, {"can_act": True})
        state = parse_qs(urlsplit(response.json()["authorize_url"]).query)["state"][0]
        api.scopes = [*BASE_SCOPES, "chat:write"]
        self.sign_out_keeping_cookies()
        answer = self.client.get(CALLBACK, {"code": "c", "state": state})
        self.assertIn("connector=agents_on", answer["Location"])
        consent = AuditEvent.objects.get(action="connector.agent_access")
        self.assertEqual(
            {k: consent.metadata.get(k) for k in ("can_act", "was", "token_replaced")},
            {"can_act": True, "was": True, "token_replaced": True},
        )

    @override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
    def test_a_consent_finished_after_losing_manage_integrations_is_refused(self):
        api = use_slack(self)
        slack = self.make("slack", via="oauth")
        state = parse_qs(
            urlsplit(self.post(slack, {"can_act": True}).json()["authorize_url"]).query
        )["state"][0]
        self.admin.role = self.org.roles.get(slug=User.Role.CSM)
        self.admin.save(update_fields=["role"])
        api.scopes = [*BASE_SCOPES, "chat:write"]
        self.sign_out_keeping_cookies()
        answer = self.client.get(CALLBACK, {"code": "c", "state": state})
        self.assertIn("connector=error", answer["Location"])
        self.assertIn("Unknown+connector", answer["Location"])
        slack.refresh_from_db()
        self.assertFalse(slack.agents_can_act)
        self.assertEqual(slack.get_credentials(), {"bot_token": "xoxb-test"})
        self.assertFalse(AuditEvent.objects.filter(action="connector.agent_access").exists())

    @override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
    def test_a_demoted_admins_refused_callback_is_audited(self):
        # Round 2 D1 contract R2D1-11.
        use_slack(self)
        slack = self.make("slack", via="oauth")
        state = parse_qs(
            urlsplit(self.post(slack, {"can_act": True}).json()["authorize_url"]).query
        )["state"][0]
        self.admin.role = self.org.roles.get(slug=User.Role.CSM)
        self.admin.save(update_fields=["role"])
        self.sign_out_keeping_cookies()
        self.client.get(CALLBACK, {"code": "c", "state": state})
        refused = AuditEvent.objects.get(action="connector.oauth_refused")
        self.assertEqual(
            (refused.actor_id, refused.metadata, refused.outcome),
            (self.admin.pk, {"provider": "slack", "reason": "not_allowed"}, "failure"),
        )

    def test_disconnecting_turns_the_switch_off(self):
        slack = self.make(
            "slack",
            agents_can_act=True,
            granted_scopes=["chat:write"],
            agents_allowed_by=self.admin,
        )
        self.client.force_authenticate(self.admin)
        response = self.client.delete(f"/api/v1/connectors/{slack.pk}/credentials/")
        self.assertEqual(response.status_code, 204)
        slack.refresh_from_db()
        self.assertEqual(
            (
                slack.agents_can_act,
                slack.agents_allowed_by,
                slack.agents_allowed_at,
                slack.granted_scopes,
            ),
            (False, None, None, []),
        )
        event = AuditEvent.objects.get(action="connector.agent_access")
        self.assertEqual(
            (event.actor, event.ip, event.metadata),
            (
                self.admin,
                "127.0.0.1",
                {
                    "provider": "slack",
                    "can_act": False,
                    "was": True,
                    "scopes": [],
                    "disconnect": True,
                },
            ),
        )

    def test_disconnecting_a_read_only_tool_writes_no_switch_audit(self):
        slack = self.make("slack")
        self.client.force_authenticate(self.admin)
        self.client.delete(f"/api/v1/connectors/{slack.pk}/credentials/")
        self.assertFalse(AuditEvent.objects.filter(action="connector.agent_access").exists())

    @override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
    def test_consent_from_another_slack_workspace_is_refused(self):
        api = use_slack(self)
        slack = self.make("slack", via="oauth")
        state = parse_qs(
            urlsplit(self.post(slack, {"can_act": True}).json()["authorize_url"]).query
        )["state"][0]
        api.team, api.scopes = "T0OTHER", [*BASE_SCOPES, "chat:write"]
        self.sign_out_keeping_cookies()
        answer = self.client.get(CALLBACK, {"code": "c", "state": state})
        self.assertIn("connector=error", answer["Location"])
        self.assertIn("different+Slack+workspace", answer["Location"])
        slack.refresh_from_db()
        self.assertFalse(slack.agents_can_act)
        self.assertEqual(slack.get_credentials(), {"bot_token": "xoxb-test"})

    @override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
    def test_consent_without_chat_write_switches_nothing(self):
        use_slack(self)
        slack = self.make("slack", via="oauth")
        state = parse_qs(
            urlsplit(self.post(slack, {"can_act": True}).json()["authorize_url"]).query
        )["state"][0]
        self.sign_out_keeping_cookies()
        answer = self.client.get(CALLBACK, {"code": "c", "state": state})
        self.assertIn("didn%27t+grant+permission+to+post", answer["Location"])

    def test_jira_switches_on_with_create_and_assign(self):
        use_jira(self)
        jira = self.make("jira")
        response = self.post(jira, {"can_act": True})
        self.assertEqual(response.status_code, 200, response.content)
        jira.refresh_from_db()
        self.assertEqual(
            sorted(jira.granted_scopes),
            ["ADD_COMMENTS", "ASSIGN_ISSUES", "BROWSE_PROJECTS", "CREATE_ISSUES"],
        )

    def test_jira_without_permission_is_refused(self):
        api = use_jira(self)
        api.permissions = {"BROWSE_PROJECTS"}
        jira = self.make("jira")
        self.assertEqual(
            self.post(jira, {"can_act": True}).json(),
            {
                "code": "JIRA_CANT_ACT",
                "detail": "This Jira account can't create and assign issues in SUP. "
                "Give it those permissions in Jira, then try again.",
            },
        )

    def test_jira_refusing_the_login(self):
        api = use_jira(self)
        api.refuse_next(r"mypermissions", 401)
        jira = self.make("jira")
        self.assertEqual(
            self.post(jira, {"can_act": True}).json(),
            {
                "code": "RECONNECT",
                "detail": "Jira refused the login. Reconnect Jira, then try again.",
            },
        )

    def test_read_only_switches_off(self):
        slack = self.make(
            "slack",
            agents_can_act=True,
            granted_scopes=["chat:write"],
            agents_allowed_by=self.admin,
        )
        response = self.post(slack, {"can_act": False})
        self.assertEqual(response.status_code, 200)
        slack.refresh_from_db()
        self.assertEqual((slack.agents_can_act, slack.agents_allowed_by), (False, None))

    def test_off_when_already_off_writes_no_audit(self):
        slack = self.make("slack")
        self.assertEqual(self.post(slack, {"can_act": False}).status_code, 200)
        self.assertFalse(AuditEvent.objects.filter(action="connector.agent_access").exists())
