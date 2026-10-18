"""The Slack link routes (Connections spec §3 Slack): Slack is a fake; the
OAuth round trip is bound to the starting browser, asks for user scopes
only, and keeps a token only for an account in the connection's Slack
workspace."""

from urllib.parse import parse_qs, urlsplit

from django.test import override_settings
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors import slack_link_views
from services.connectors.models import SlackLink
from services.connectors.tests.slack_fake import use_slack

LINK = "/api/v1/connectors/slack-link/"
CALLBACK = "/api/v1/connectors/slack-link/callback/"
ON = {
    "SLACK_OAUTH_CLIENT_ID": "cid",
    "SLACK_OAUTH_CLIENT_SECRET": "secret",
    "FRONTEND_URL": "https://app.test",
}


def slack_link_for(user, *, slack_user_id="U0CARL", team_id="T0ACME", status="linked"):
    link = SlackLink(
        organisation=user.organisation,
        user=user,
        team_id=team_id,
        slack_user_id=slack_user_id,
        name=user.name,
        scopes=["chat:write", "users:read"],
        status=status,
    )
    link.set_credentials({"access_token": f"xoxp-{slack_user_id.lower()}"})
    link.save()
    return link


@override_settings(**ON)
class SlackLinkRouteTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.channel = self.slack_connector()
        self.api = use_slack(self)

    def start(self, user):
        client = self.client_for(user)
        answer = client.post(LINK)
        self.assertEqual(answer.status_code, 200, answer.content)
        url = answer.json()["authorize_url"]
        return client, parse_qs(urlsplit(url).query)

    def finish(self, client, query, code="good-code"):
        answer = client.get(CALLBACK, {"code": code, "state": query["state"][0]})
        self.assertEqual(answer.status_code, 302)
        landed = urlsplit(answer["Location"])
        self.assertEqual(
            f"{landed.scheme}://{landed.netloc}{landed.path}",
            "https://app.test/settings/connections",
        )
        return {k: v[0] for k, v in parse_qs(landed.query).items()}

    def test_link_see_and_unlink(self):
        client, query = self.start(self.csm)
        self.assertEqual(query["user_scope"], ["chat:write,users:read"])
        self.assertNotIn("scope", query)
        self.assertEqual(self.finish(client, query), {"slack_link": "linked"})
        link = SlackLink.objects.get(user=self.csm)
        self.assertEqual(
            (link.slack_user_id, link.team_id, link.name, link.status),
            ("U0CARL", "T0ACME", "Carl Lee", "linked"),
        )
        self.assertEqual(link.get_credentials(), {"access_token": "xoxp-u0carl"})
        body = self.client_for(self.csm).get(LINK).json()
        self.assertEqual(
            {k: v for k, v in body.items() if k != "link"},
            {"configured": True, "workspace_connected": True},
        )
        self.assertEqual(
            {k: v for k, v in body["link"].items() if k != "linked_at"},
            {
                "name": "Carl Lee",
                "slack_user_id": "U0CARL",
                "team_id": "T0ACME",
                "status": "linked",
            },
        )
        self.assertTrue(body["link"]["linked_at"])
        self.assertNotIn("xoxp", str(body))
        event = AuditEvent.objects.get(action="slack.link")
        self.assertEqual(event.metadata["slack_user_id"], "U0CARL")
        self.assertNotIn("xoxp", str(event.metadata))

        self.assertEqual(self.client_for(self.csm).delete(LINK).status_code, 204)
        self.assertFalse(SlackLink.objects.exists())
        self.assertEqual(self.api.revoked, ["xoxp-u0carl"])
        self.assertEqual(
            AuditEvent.objects.get(action="slack.unlink").metadata,
            {"reason": "person", "revoked": True},
        )

    def test_unlink_still_deletes_when_slack_refuses_the_revoke(self):
        slack_link_for(self.csm)
        self.api.refuse_next("auth.revoke", "invalid_auth")
        self.assertEqual(self.client_for(self.csm).delete(LINK).status_code, 204)
        self.assertFalse(SlackLink.objects.exists())
        self.assertEqual(AuditEvent.objects.get(action="slack.unlink").metadata["revoked"], False)

    def test_unlink_without_a_link_is_quiet(self):
        self.assertEqual(self.client_for(self.csm).delete(LINK).status_code, 204)
        self.assertFalse(AuditEvent.objects.filter(action="slack.unlink").exists())

    def test_only_your_own_link_is_ever_shown(self):
        slack_link_for(self.csm)
        self.assertIsNone(self.client_for(self.other).get(LINK).json()["link"])
        self.assertIsNone(self.client_for(self.admin).get(LINK).json()["link"])
        self.assertIsNone(self.client_for(self.mona).get(LINK).json()["link"])
        self.assertEqual(self.client_for(self.csm).get(LINK).json()["link"]["name"], "Carl CSM")

    def test_another_person_cannot_unlink_yours(self):
        slack_link_for(self.csm)
        self.assertEqual(self.client_for(self.admin).delete(LINK).status_code, 204)
        self.assertTrue(SlackLink.objects.filter(user=self.csm).exists())

    def test_anonymous_is_refused(self):
        self.assertEqual(APIClient().get(LINK).status_code, 401)
        self.assertEqual(APIClient().post(LINK).status_code, 401)

    def test_refusals_before_the_round_trip(self):
        with override_settings(SLACK_OAUTH_CLIENT_ID=""):
            answer = self.client_for(self.csm).post(LINK)
            self.assertEqual(self.client_for(self.csm).get(LINK).json()["configured"], False)
        self.assertEqual((answer.status_code, answer.json()["code"]), (409, "SLACK_LINK_OFF"))
        self.channel.is_enabled = False
        self.channel.save()
        self.assertEqual(self.client_for(self.csm).get(LINK).json()["workspace_connected"], False)
        answer = self.client_for(self.csm).post(LINK)
        self.assertEqual(
            (answer.status_code, answer.json()),
            (409, {"code": "NO_SLACK", "detail": "This workspace has no Slack connection yet."}),
        )

    def test_another_browser_gets_nothing(self):
        _, query = self.start(self.csm)
        landed = self.finish(APIClient(), query)
        self.assertEqual(landed["detail"], "Open the link in the browser that started it.")
        self.assertFalse(SlackLink.objects.exists())
        self.assertNotIn("oauth.v2.access", [name for name, *_ in self.api.calls])
        self.assertEqual(
            AuditEvent.objects.get(action="slack.link_refused").metadata["reason"], "other_browser"
        )

    def test_an_account_in_another_slack_workspace_is_refused_and_revoked(self):
        self.assertEqual(
            slack_link_views.OTHER_TEAM,
            "Your Slack account is in a different Slack workspace"
            " from Revenact's Slack connection.",
        )
        self.api.authed_team = "T0OTHER"
        client, query = self.start(self.csm)
        landed = self.finish(client, query)
        self.assertEqual(
            landed["detail"],
            slack_link_views.OTHER_TEAM,
        )
        self.assertFalse(SlackLink.objects.exists())
        self.assertEqual(self.api.revoked, ["xoxp-u0carl"])
        self.assertEqual(
            AuditEvent.objects.get(action="slack.link_refused").metadata["reason"], "other_team"
        )

    def test_one_account_one_person(self):
        slack_link_for(self.other, slack_user_id="U0CARL")
        client, query = self.start(self.csm)
        self.assertEqual(
            self.finish(client, query)["detail"], "Someone else here has linked that Slack account."
        )
        self.assertEqual(
            AuditEvent.objects.get(action="slack.link_refused").metadata["reason"], "taken"
        )
        self.assertFalse(SlackLink.objects.filter(user=self.csm).exists())

    def test_linking_again_replaces_your_link(self):
        slack_link_for(self.csm, slack_user_id="U0OLD")
        client, query = self.start(self.csm)
        self.assertEqual(self.finish(client, query), {"slack_link": "linked"})
        self.assertEqual(SlackLink.objects.get(user=self.csm).slack_user_id, "U0CARL")
        self.assertIs(AuditEvent.objects.get(action="slack.link").metadata["replaced"], True)

    def test_a_refused_code_a_denied_consent_and_a_bad_state(self):
        client, query = self.start(self.csm)
        self.assertEqual(
            self.finish(client, query, code="bad")["detail"],
            "Slack didn't accept the sign-in. Try again.",
        )
        answer = self.client_for(self.csm).get(CALLBACK, {"error": "access_denied"})
        self.assertIn("didn%27t+allow", answer["Location"])
        answer = self.client_for(self.csm).get(CALLBACK, {"code": "x", "state": "forged"})
        self.assertIn("expired", answer["Location"])
        self.assertFalse(SlackLink.objects.exists())
