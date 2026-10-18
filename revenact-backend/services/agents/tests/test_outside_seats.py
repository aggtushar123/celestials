"""Who a Jira step acts as (agent bundles round 2 D2 contract §3): the
runner's link when it covers the site, else the connection's account; a
lost link fails the step with the contract's sentence."""

from unittest.mock import patch

from django.db import transaction
from django.test import override_settings

from core.models import AuditEvent
from services.agents import bulk
from services.agents.kinds import StepFailed
from services.agents.outside import seats, sentences, tools, trail
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors.jira_links import Seat
from services.connectors.models import JiraLink
from services.connectors.providers.base import ProviderError
from services.connectors.tests.atlassian_fake import use_atlassian

ON = {"ATLASSIAN_OAUTH_CLIENT_ID": "cid", "ATLASSIAN_OAUTH_CLIENT_SECRET": "secret"}


@override_settings(**ON)
class SeatTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector()
        self.atlassian = use_atlassian(self)

    def test_the_runner_acts_as_themselves_when_linked(self):
        self.link_for(self.csm)
        seat = seats.for_step(self.board, self.csm)
        self.assertEqual((seat.person, seat.name), (True, self.csm.name))
        self.assertEqual(seats.acted(seat), {"acted_as": "person", "jira_account": self.csm.name})
        self.assertEqual(seats.as_of(seat), "person")

    def test_no_link_or_another_site_acts_as_the_connection(self):
        seat = seats.for_step(self.board, self.csm)
        self.assertEqual(seat.name, "Jira Bot")
        self.assertEqual(seats.acted(seat), {"acted_as": "connection", "jira_account": "Jira Bot"})
        self.link_for(self.other, host="other.atlassian.net")
        self.assertFalse(seats.for_step(self.board, self.other).person)

    def test_a_lost_link_fails_the_step(self):
        self.link_for(self.csm, status="lost")
        with self.assertRaises(StepFailed) as caught:
            seats.for_step(self.board, self.csm, {"attempted_at": "x"})
        self.assertEqual(
            caught.exception.detail,
            "Your Jira link stopped working. Link Jira again, or remove the link to act as "
            "Jira Bot.",
        )
        self.assertEqual(caught.exception.result, {"attempted_at": "x"})

    def test_the_lost_sentence_names_the_jira_connection_without_an_account_name(self):
        self.board.config = {"host": "acme.atlassian.net", "project": "SUP"}
        self.board.save()
        self.assertEqual(
            seats.lost_sentence(self.board),
            "Your Jira link stopped working. Link Jira again, or remove the link to act as "
            "the Jira connection.",
        )

    def test_a_refused_refresh_inside_the_step_keeps_the_lost_mark_and_its_audit(self):
        """run_step catches StepFailed inside the step's savepoint, so the
        savepoint (and the lost mark written under the row lock) commits."""
        link = self.link_for(self.csm, expires_in=10)
        self.atlassian.refuse_refresh()
        kept = None
        with transaction.atomic():
            with transaction.atomic():
                try:
                    seats.for_step(self.board, self.csm, {"attempted_at": "x"})
                except StepFailed as exc:
                    kept = exc
        self.assertEqual(kept.detail, seats.lost_sentence(self.board))
        link.refresh_from_db()
        self.assertEqual(link.status, JiraLink.Status.LOST)
        self.assertTrue(AuditEvent.objects.filter(action="jira.link_lost").exists())

    def test_atlassian_unreachable_fails_the_step_and_keeps_the_link(self):
        link = self.link_for(self.csm, expires_in=10)
        self.atlassian.live_refresh.add("rt-0")
        self.atlassian.drop_refresh()
        with self.assertRaises(StepFailed) as caught:
            seats.for_step(self.board, self.csm)
        self.assertEqual(
            caught.exception.detail, "Couldn't reach Atlassian to use your Jira link. Retry it."
        )
        link.refresh_from_db()
        self.assertEqual(link.status, JiraLink.Status.LINKED)

    def test_warm_refreshes_a_token_expiring_soon(self):
        self.link_for(self.csm, expires_in=300)
        self.atlassian.live_refresh.add("rt-0")
        seats.warm(self.csm)
        self.assertEqual(self.atlassian.refreshes, ["rt-0"])
        seats.warm(self.other)  # no link: nothing to do
        self.assertEqual(self.atlassian.refreshes, ["rt-0"])

    def test_the_page_reads_a_reader_link_once(self):
        self.link_for(self.csm)
        with bulk.using([]):
            with self.assertNumQueries(1):
                self.assertEqual(seats.link_of(self.csm).user_id, self.csm.pk)
                self.assertEqual(seats.link_of(self.csm).user_id, self.csm.pk)
        self.assertIsNone(seats.link_of(None))

    def test_person_sentences(self):
        refused = ProviderError("401", status=401)
        self.assertEqual(
            sentences.jira(refused, person=True),
            "Jira refused your Jira link. Link Jira again, then Retry.",
        )
        self.assertEqual(sentences.jira(refused), sentences.JIRA_LOGIN)
        forbidden = ProviderError("403", status=403)
        self.assertEqual(
            sentences.jira(forbidden, issue="SUP-12", person=True),
            "Your Jira account can't do this in SUP-12. Ask a Jira admin for permission, "
            "then Retry.",
        )
        self.assertEqual(
            sentences.jira(forbidden, issue="SUP-12"),
            "The Jira account can't do this in SUP-12. Give it permission in Jira, then Retry.",
        )
        self.assertEqual(
            sentences.list_failure(refused, person=True),
            ("TOOL_REFUSED", "Jira refused your Jira link. Link Jira again, then try again.", 409),
        )
        # A permission error as the person is no reason to relink, nor to
        # reconnect the connection (fixes after the live test): the link can't.
        self.assertEqual(
            sentences.list_failure(forbidden, person=True),
            ("TOOL_REFUSED", sentences.LIST_LINK_SCOPE, 409),
        )
        self.assertEqual(
            sentences.list_failure(refused), ("TOOL_REFUSED", sentences.LIST_REFUSED, 409)
        )
        self.assertEqual(
            sentences.LIST_ATLASSIAN_UNREACHABLE, "Couldn't reach Atlassian. Try again."
        )

    def test_the_trail_says_who_acted(self):
        _, thread = self.slack_thread(self.pizza)
        bundle = self.outside_bundle(thread, ("jira.create", self.jira_payload(self.board)))
        step = bundle.steps.get()
        trail.call(step, self.csm, tool="jira", op="create", outcome="ok", as_="person")
        trail.call(step, self.csm, tool="jira", op="lookup", outcome="none")
        named, unnamed = AuditEvent.objects.filter(action="agent_outside.call").order_by("pk")
        self.assertEqual(named.metadata["as"], "person")
        self.assertNotIn("as", unnamed.metadata)


@override_settings(**ON)
class JiraToolSeatTests(OutsideFixture):
    """The facade calls Jira from the seat it is given, else the connection's."""

    def setUp(self):
        super().setUp()
        self.board = self.jira_connector()
        self.person = Seat(
            config={**self.board.config, "api_base": "https://api.atlassian.com/ex/jira/c1"},
            creds={"access_token": "at-1"},
            person=True,
            name="Carl Lee",
            link_id=1,
        )

    def provider(self):
        made = patch("services.agents.outside.tools.JiraTool._jira")
        jira = made.start().return_value
        self.addCleanup(made.stop)
        return jira

    def test_a_seat_carries_its_config_and_creds(self):
        jira = self.provider()
        jira.create_issue.return_value = "SUP-1"
        issue = tools.JiraTool().create(self.board, fields={}, project="SUP", seat=self.person)
        config, creds = jira.create_issue.call_args.args
        self.assertEqual(creds, {"access_token": "at-1"})
        self.assertIn("api_base", config)
        self.assertEqual(issue.url, "https://acme.atlassian.net/browse/SUP-1")

    def test_no_seat_is_the_connection(self):
        jira = self.provider()
        jira.create_priorities.return_value = []
        tools.JiraTool().priorities(self.board, project="SUP", issue_type="10001")
        config, creds, *_ = jira.create_priorities.call_args.args
        self.assertEqual(creds, self.board.get_credentials())
        self.assertNotIn("api_base", config)

    def test_a_refusal_as_the_person_says_so(self):
        jira = self.provider()
        jira.add_comment.side_effect = ProviderError("401", status=401)
        with self.assertRaises(tools.Refused) as caught:
            tools.JiraTool().comment(self.board, issue="SUP-12", body={}, seat=self.person)
        self.assertEqual(caught.exception.sentence, sentences.JIRA_LINK_REFUSED)
        jira.assignable.side_effect = ProviderError("401", status=401)
        with self.assertRaises(tools.ListFailed) as listed:
            tools.JiraTool().options(self.board, "jira_assignees", project="SUP", seat=self.person)
        self.assertEqual(listed.exception.detail, sentences.LIST_LINK_REFUSED)

    def test_the_fake_records_seats(self):
        self.jira.priorities(self.board, project="SUP", issue_type="10001", seat=self.person)
        self.jira.priorities(self.board, project="SUP", issue_type="10001")
        self.assertEqual(self.jira.seats, [self.person, None])
