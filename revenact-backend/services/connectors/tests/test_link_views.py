"""The Jira link routes (agent bundles round 2 D2 contract §2). Atlassian is
a fake; the OAuth round trip is bound to the starting browser."""

from urllib.parse import parse_qs, urlsplit

from django.core import signing
from django.test import override_settings
from django.urls import resolve
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors import link_views
from services.connectors.models import JiraLink
from services.connectors.tests.atlassian_fake import use_atlassian

LINK = "/api/v1/connectors/jira-link/"
CALLBACK = "/api/v1/connectors/jira-link/callback/"
ON = {
    "ATLASSIAN_OAUTH_CLIENT_ID": "cid",
    "ATLASSIAN_OAUTH_CLIENT_SECRET": "secret",
    "FRONTEND_URL": "https://app.test",
}
#: GET /connectors/jira-link/ (contract §8), measured.
JIRA_LINK_QUERIES = 2


@override_settings(**ON)
class JiraLinkRouteTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector()
        self.atlassian = use_atlassian(self)

    def start(self, user):
        client = self.client_for(user)
        answer = client.post(LINK)
        self.assertEqual(answer.status_code, 200, answer.content)
        state = parse_qs(urlsplit(answer.json()["authorize_url"]).query)["state"][0]
        return client, state

    def finish(self, client, state, code="good-code"):
        answer = client.get(CALLBACK, {"code": code, "state": state})
        self.assertEqual(answer.status_code, 302)
        return {k: v[0] for k, v in parse_qs(urlsplit(answer["Location"]).query).items()}

    def test_link_see_and_unlink(self):
        client, state = self.start(self.csm)
        self.assertEqual(self.finish(client, state), {"jira_link": "linked"})
        link = JiraLink.objects.get(user=self.csm)
        self.assertEqual(
            (link.account_id, link.name, link.status), ("acc-carl", "Carl Lee", "linked")
        )
        body = self.client_for(self.csm).get(LINK).json()
        self.assertEqual(body["configured"], True)
        self.assertEqual(
            body["connectors"],
            [{"id": self.board.pk, "name": self.board.name, "host": "acme.atlassian.net"}],
        )
        self.assertEqual(body["link"]["covers"], [self.board.pk])
        self.assertNotIn("credentials", str(body))
        event = AuditEvent.objects.get(action="jira.link")
        self.assertEqual(event.metadata["account_id"], "acc-carl")
        self.assertEqual(self.client_for(self.csm).delete(LINK).status_code, 204)
        self.assertFalse(JiraLink.objects.exists())
        self.assertEqual(
            AuditEvent.objects.get(action="jira.unlink").metadata, {"reason": "person"}
        )

    def test_only_your_own_link_is_ever_shown(self):
        self.link_for(self.csm)
        self.assertIsNone(self.client_for(self.other).get(LINK).json()["link"])
        self.assertIsNone(self.client_for(self.admin).get(LINK).json()["link"])

    def test_refusals_before_the_round_trip(self):
        with override_settings(ATLASSIAN_OAUTH_CLIENT_ID=""):
            answer = self.client_for(self.csm).post(LINK)
        self.assertEqual((answer.status_code, answer.json()["code"]), (409, "JIRA_LINK_OFF"))
        self.board.is_enabled = False
        self.board.save()
        answer = self.client_for(self.csm).post(LINK)
        self.assertEqual(
            answer.json(),
            {"code": "NO_JIRA", "detail": "This workspace has no Jira connection yet."},
        )

    def test_another_browser_gets_nothing(self):
        _, state = self.start(self.csm)
        landed = self.finish(APIClient(), state)
        self.assertEqual(landed["detail"], "Open the link in the browser that started it.")
        self.assertFalse(JiraLink.objects.exists())
        self.assertEqual(self.atlassian.tokens_issued, 0)
        self.assertEqual(
            AuditEvent.objects.get(action="jira.link_refused").metadata["reason"], "other_browser"
        )

    def test_an_account_without_the_site_is_refused_and_keeps_no_token(self):
        self.atlassian.resources = [
            {
                "id": "c2",
                "url": "https://other.atlassian.net",
                "name": "other",
                "scopes": ["read:jira-work"],
            }
        ]
        client, state = self.start(self.csm)
        landed = self.finish(client, state)
        self.assertEqual(
            landed["detail"],
            "Your Atlassian account can't open acme.atlassian.net,"
            " the site Revenact's Jira connection uses.",
        )
        self.assertFalse(JiraLink.objects.exists())

    def test_one_account_one_person(self):
        self.link_for(self.other, account_id="acc-carl")
        client, state = self.start(self.csm)
        self.assertEqual(
            self.finish(client, state)["detail"],
            "Someone else here has linked that Atlassian account.",
        )
        self.assertEqual(
            AuditEvent.objects.get(action="jira.link_refused").metadata["reason"], "taken"
        )

    def test_no_refresh_token_no_link(self):
        self.atlassian.give_refresh_token = False
        client, state = self.start(self.csm)
        self.assertEqual(
            self.finish(client, state)["detail"],
            "Atlassian didn't allow Revenact to stay linked. Try again.",
        )

    def test_a_refused_code_and_a_denied_consent(self):
        client, state = self.start(self.csm)
        self.assertEqual(
            self.finish(client, state, code="bad")["detail"],
            "Atlassian didn't accept the sign-in. Try again.",
        )
        answer = self.client_for(self.csm).get(CALLBACK, {"error": "access_denied"})
        self.assertIn("didn%27t+allow+Revenact", answer["Location"])

    def test_relinking_replaces_the_link(self):
        self.link_for(self.csm, account_id="acc-old")
        client, state = self.start(self.csm)
        self.finish(client, state)
        self.assertEqual(JiraLink.objects.get().account_id, "acc-carl")
        self.assertEqual(AuditEvent.objects.get(action="jira.link").metadata["replaced"], True)

    def test_reading_the_link_costs_the_same(self):
        self.link_for(self.csm)
        client = self.client_for(self.csm)
        client.get(LINK)
        with self.assertNumQueries(JIRA_LINK_QUERIES):
            self.assertEqual(client.get(LINK).status_code, 200)

    # Beyond the brief: the routes resolve, and the callback's security edges.

    def test_both_routes_resolve_before_the_connector_detail(self):
        self.assertIs(resolve(LINK).func.view_class, link_views.JiraLinkView)
        self.assertIs(resolve(CALLBACK).func.view_class, link_views.JiraLinkCallbackView)

    def test_the_routes_need_a_signed_in_member(self):
        anonymous = APIClient()
        self.assertEqual(anonymous.get(LINK).status_code, 401)
        self.assertEqual(anonymous.post(LINK).status_code, 401)
        self.assertEqual(anonymous.delete(LINK).status_code, 401)

    def test_every_answer_clears_the_cookie_and_lands_on_the_frontend(self):
        client, _ = self.start(self.csm)
        self.assertIn(link_views.COOKIE, client.cookies)
        answer = client.get(
            CALLBACK, {"code": "good-code", "state": "forged", "next": "https://evil.test"}
        )
        self.assertTrue(answer["Location"].startswith("https://app.test/integrations?"))
        self.assertEqual(answer.cookies[link_views.COOKIE]["max-age"], 0)
        landed = parse_qs(urlsplit(answer["Location"]).query)
        self.assertEqual(landed["detail"], ["This link is invalid or has expired. Try again."])
        self.assertEqual(self.atlassian.tokens_issued, 0)

    def test_an_unexpected_failure_says_exchange_and_logs_only_its_type(self):
        from unittest.mock import patch

        client, state = self.start(self.csm)
        boom = RuntimeError("at-1 secret detail")
        with (
            patch("services.connectors.jira_links.resources", side_effect=boom),
            self.assertLogs("services.connectors.link_views", "WARNING") as logs,
        ):
            answer = client.get(CALLBACK, {"code": "good-code", "state": state})
        landed = parse_qs(urlsplit(answer["Location"]).query)
        self.assertEqual(landed, {"jira_link": ["error"], "detail": [link_views.EXCHANGE]})
        self.assertEqual(answer.cookies[link_views.COOKIE]["max-age"], 0)
        self.assertNotIn("secret", "".join(logs.output))
        self.assertIn("RuntimeError", "".join(logs.output))
        self.assertFalse(JiraLink.objects.exists())

    def test_a_state_signed_for_something_else_is_refused(self):
        client, _ = self.start(self.csm)
        other = signing.dumps({"user": self.csm.pk}, salt="connectors.oauth")
        landed = self.finish(client, other)
        self.assertEqual(landed["detail"], "This link is invalid or has expired. Try again.")

    def test_an_inactive_person_links_nothing(self):
        client, state = self.start(self.csm)
        type(self.csm).objects.filter(pk=self.csm.pk).update(is_active=False)
        landed = self.finish(client, state)
        self.assertEqual(landed["detail"], "This link is invalid or has expired. Try again.")
        self.assertEqual(self.atlassian.tokens_issued, 0)
        self.assertFalse(AuditEvent.objects.filter(action="jira.link_refused").exists())

    def test_tokens_are_never_answered_or_audited(self):
        client, state = self.start(self.csm)
        self.finish(client, state)
        link = JiraLink.objects.get()
        self.assertEqual(link.get_credentials()["refresh_token"], "rt-1")
        self.assertNotIn("at-1", link.credentials)
        body = str(self.client_for(self.csm).get(LINK).json())
        self.assertNotIn("at-1", body)
        self.assertNotIn("rt-1", body)
        event = AuditEvent.objects.get(action="jira.link")
        self.assertEqual(set(event.metadata), {"account_id", "sites", "scopes", "replaced"})
        self.assertNotIn("at-1", str(event.metadata))
        self.assertNotIn("carl@acme.io", str(event.metadata))

    def test_unlinking_nothing_audits_nothing(self):
        self.assertEqual(self.client_for(self.csm).delete(LINK).status_code, 204)
        self.assertFalse(AuditEvent.objects.filter(action="jira.unlink").exists())

    def test_unlinking_leaves_other_peoples_links(self):
        self.link_for(self.other)
        self.assertEqual(self.client_for(self.csm).delete(LINK).status_code, 204)
        self.assertTrue(JiraLink.objects.filter(user=self.other).exists())

    def test_refusals_say_why_in_the_audit_log(self):
        self.atlassian.give_refresh_token = False
        client, state = self.start(self.csm)
        self.finish(client, state)
        self.atlassian.give_refresh_token = True
        client, state = self.start(self.csm)
        self.finish(client, state, code="bad")
        self.assertEqual(
            sorted(
                AuditEvent.objects.filter(action="jira.link_refused").values_list(
                    "metadata__reason", flat=True
                )
            ),
            ["exchange", "no_refresh"],
        )
