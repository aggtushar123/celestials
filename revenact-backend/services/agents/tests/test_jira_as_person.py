"""Jira steps act as the person who runs them (agent bundles round 2 D2
contract §3, R2D2-2, R2D2-9, R2D2-10). Jira is a fake."""

from unittest.mock import patch

from django.test import override_settings

from core.models import AuditEvent
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors.models import Connector, JiraLink

DETAIL = "/api/v1/agents/bundles/{}/"
ON = {"ATLASSIAN_OAUTH_CLIENT_ID": "cid", "ATLASSIAN_OAUTH_CLIENT_SECRET": "secret"}
LOST = "Your Jira link stopped working. Link Jira again, or remove the link to act as Jira Bot."


@override_settings(**ON)
class JiraAsPersonTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        # Customer Success's Jira: Carl reads its tickets, so he reads and runs the bundle.
        self.board = self.jira_connector(department="cs")
        self.ticket, self.thread = self.jira_thread(self.pizza, self.board)
        self.bundle = self.outside_bundle(
            self.thread,
            ("jira.create", self.jira_payload(self.board)),
            (
                "jira.comment",
                {"connector_id": self.board.pk, "issue": "SUP-12", "body": "Seen on Safari too."},
            ),
        )
        self.create, self.comment = self.bundle.steps.order_by("position")

    def steps(self, user):
        return self.client_for(user).get(DETAIL.format(self.bundle.pk)).json()["steps"]

    def test_the_panel_names_who_acts_for_each_reader(self):
        self.link_for(self.csm)
        carl = self.steps(self.csm)
        self.assertEqual(
            {k: carl[0]["preview"]["jira"][k] for k in ("as", "as_you", "link")},
            {"as": self.csm.name, "as_you": True, "link": None},
        )
        self.assertEqual(carl[1]["preview"]["jira_comment"]["as_you"], True)
        alice = self.steps(self.admin)
        self.assertEqual(
            {k: alice[0]["preview"]["jira"][k] for k in ("as", "as_you", "link")},
            {"as": "Jira Bot", "as_you": False, "link": "none"},
        )

    def test_a_linked_runner_creates_and_comments_as_themselves(self):
        self.link_for(self.csm)
        self.run_all_steps(self.csm, self.bundle)
        used = [s for s in self.jira.seats if s is not None]
        self.assertTrue(used)
        self.assertTrue(all(s.person and s.config.get("api_base") for s in used))
        self.create.refresh_from_db()
        self.assertEqual(
            (self.create.result["acted_as"], self.create.result["jira_account"]),
            ("person", self.csm.name),
        )
        rows = AuditEvent.objects.filter(action="agent_outside.call").values_list(
            "metadata__as", flat=True
        )
        self.assertEqual(set(rows), {"person"})

    def test_a_linked_runner_assigns_as_themselves(self):
        self.link_for(self.csm)
        bundle = self.outside_bundle(
            self.thread,
            ("jira.assign", self.assign_payload(self.board, "SUP-12", member=self.erin.pk)),
        )
        step = bundle.steps.get()
        shown = self.client_for(self.csm).get(DETAIL.format(bundle.pk)).json()["steps"][0]
        self.assertEqual(
            {k: shown["preview"]["jira_assign"][k] for k in ("as", "as_you", "link")},
            {"as": self.csm.name, "as_you": True, "link": None},
        )
        self.run_all_steps(self.csm, bundle)
        step.refresh_from_db()
        self.assertEqual(step.status, "applied", step.error)
        self.assertEqual(self.jira.assigned, [("SUP-12", "acc-erin")])
        self.assertTrue(self.jira.seats and all(s.person for s in self.jira.seats))
        self.assertEqual(step.result["acted_as"], "person")
        rows = AuditEvent.objects.filter(action="agent_outside.call").values_list(
            "metadata__as", flat=True
        )
        self.assertEqual(set(rows), {"person"})

    def test_an_unlinked_runner_acts_as_the_connection(self):
        self.run_all_steps(self.csm, self.bundle)
        self.create.refresh_from_db()
        self.assertEqual(self.create.result["acted_as"], "connection")
        self.assertTrue(all(s is None or not s.person for s in self.jira.seats))

    def test_a_lost_link_blocks_and_never_falls_back(self):
        self.link_for(self.csm, status="lost")
        step = self.steps(self.csm)[0]
        self.assertEqual(
            (step["can_run"], step["disabled_reason"], step["disabled_link"]),
            (False, LOST, "/settings/connections"),
        )
        # §3.4 last row: the connection is named, but nothing falls back to it.
        self.assertEqual(
            {k: step["preview"]["jira"][k] for k in ("as", "as_you", "link")},
            {"as": "Jira Bot", "as_you": False, "link": None},
        )
        response = self.run_all_steps(self.csm, self.bundle)
        self.create.refresh_from_db()
        self.assertEqual(
            (response.status_code, self.create.status, self.create.error), (200, "failed", LOST)
        )
        self.assertEqual((self.jira.created, self.jira.seats), ([], []))

    def test_a_step_run_by_someone_else_acts_as_the_runner_not_the_routed_person(self):
        """R2D2-11: Carl's record and Carl's link; Alice (no link) runs it, so
        the connection acts, with its own Basic credentials."""
        self.link_for(self.csm)
        self.run_all_steps(self.admin, self.bundle)
        self.create.refresh_from_db()
        self.assertEqual(self.create.status, "applied", self.create.error)
        self.assertEqual(
            (self.create.result["acted_as"], self.create.result["jira_account"]),
            ("connection", "Jira Bot"),
        )
        self.assertTrue(self.jira.seats)
        for seat in self.jira.seats:
            self.assertFalse(seat.person)
            self.assertNotIn("api_base", seat.config)
            self.assertEqual(seat.creds, {"email": "bot@acme.io", "api_token": "test-only"})

    @override_settings(ATLASSIAN_OAUTH_CLIENT_ID="", ATLASSIAN_OAUTH_CLIENT_SECRET="")
    def test_while_linking_is_off_a_lost_link_neither_blocks_nor_acts(self):
        self.link_for(self.csm, status="lost")
        step = self.steps(self.csm)[0]
        self.assertEqual((step["can_run"], step["preview"]["jira"]["link"]), (True, "off"))
        self.run_all_steps(self.csm, self.bundle)
        self.create.refresh_from_db()
        self.assertEqual(self.create.result["acted_as"], "connection")

    def test_the_switch_still_gates_a_linked_runner(self):
        self.link_for(self.csm)
        Connector.objects.filter(pk=self.board.pk).update(agents_can_act=False)
        step = self.steps(self.csm)[0]
        self.assertEqual(step["disabled_reason"], "Ask an admin to allow agents to act in Jira.")

    def test_a_run_refreshes_an_expiring_token_before_the_steps(self):
        from services.connectors.tests.atlassian_fake import use_atlassian

        atlassian = use_atlassian(self)
        atlassian.live_refresh.add("rt-0")
        self.link_for(self.csm, expires_in=5 * 60)
        self.run_all_steps(self.csm, self.bundle)
        self.assertEqual(atlassian.refreshes, ["rt-0"])

    def test_a_warm_refresh_survives_a_step_that_rolls_back(self):
        # R2D2-8: warm commits before the steps, so a step whose transaction
        # rolls back never loses the rotated refresh token.
        from services.connectors.tests.atlassian_fake import use_atlassian

        atlassian = use_atlassian(self)
        atlassian.live_refresh.add("rt-0")
        link = self.link_for(self.csm, expires_in=5 * 60)
        with (
            patch.object(self.jira, "create", side_effect=RuntimeError("boom")),
            self.assertLogs("services.agents.bundle_run", "WARNING"),
        ):
            self.run_all_steps(self.csm, self.bundle)
        self.create.refresh_from_db()
        self.assertEqual(self.create.status, "failed")
        self.assertEqual(atlassian.refreshes, ["rt-0"])
        link.refresh_from_db()
        self.assertEqual(link.get_credentials()["refresh_token"], "rt-1")
        self.assertIsNotNone(link.refreshed_at)

    def assert_lost_inside_the_step(self, link, warm, atlassian):
        """Ruling F12: warm did nothing, so the one refresh (refused) was the
        step's own; the step failed with the lost sentence and the lost mark
        survived its savepoint."""
        warm.assert_called_once_with(self.csm)
        self.assertEqual(atlassian.refreshes, ["rt-0"])
        self.create.refresh_from_db()
        self.assertEqual((self.create.status, self.create.error), ("failed", LOST))
        self.assertEqual(self.jira.created, [])
        link.refresh_from_db()
        self.assertEqual(link.status, JiraLink.Status.LOST)
        self.assertEqual(
            AuditEvent.objects.filter(action="jira.link_lost", actor=self.csm).count(), 1
        )

    def test_a_refresh_refused_inside_a_run_loses_the_link_and_fails_the_step(self):
        from services.connectors.tests.atlassian_fake import use_atlassian

        atlassian = use_atlassian(self)
        atlassian.refuse_refresh()
        link = self.link_for(self.csm, expires_in=10)
        with patch("services.agents.outside.seats.warm") as warm:
            self.run_all_steps(self.csm, self.bundle)
        self.assert_lost_inside_the_step(link, warm, atlassian)

    def test_a_refresh_refused_inside_a_retry_loses_the_link_and_fails_the_step(self):
        from services.connectors.tests.atlassian_fake import use_atlassian

        self.jira.refuse_next("create", "Jira said no.")
        self.run_all_steps(self.csm, self.bundle)
        self.create.refresh_from_db()
        self.assertEqual(self.create.status, "failed")
        atlassian = use_atlassian(self)
        atlassian.refuse_refresh()
        link = self.link_for(self.csm, expires_in=10)
        with patch("services.agents.outside.seats.warm") as warm:
            self.retry(self.csm, self.create)
        self.assert_lost_inside_the_step(link, warm, atlassian)
