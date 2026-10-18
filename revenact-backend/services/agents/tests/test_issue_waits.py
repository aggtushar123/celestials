"""After-Jira surveys (Slack bundles, owner 2026-10-17): a survey held back
for the bundle's Jira issue is sent, as its owner, once the issue is
resolved: seen by the ticket sync or asked of Jira. Each wait moves on once;
a racing Undo, a daily limit, a refusal, a missing issue and 90 days are
each handled, and the owner is told. Jira is a fake; nobody is emailed (the
send is only claimed)."""

from datetime import timedelta
from unittest.mock import patch

from django.test import override_settings
from django.utils import timezone

from core.models import AuditEvent
from services.agents import issue_waits
from services.agents.models import IssueWait
from services.agents.tests.slack_bundle_fixtures import SlackBundleFixture
from services.connectors import sync
from services.connectors.providers.base import RemoteTicket
from services.metrics.models import AgentAction
from services.notifications.models import Notification
from services.surveys.models import SurveyInvite, SurveySend
from services.surveys.sending import Refusal
from services.surveys.tests.fixtures import contact

W = IssueWait.Status
KIND = Notification.Kind.AGENT_SURVEY_WAIT


@override_settings(SLACK_JIRA_PROJECT="KAN")
class IssueWaitTests(SlackBundleFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        contact(cls.pizza, "Ann")

    def setUp(self):
        super().setUp()
        self.tracker = self.jira_connector(project="KAN")
        self.jira.types["KAN"] = [{"id": "20002", "name": "Bug", "detail": ""}]

    def held(self):
        """Carl ran a bundle whose survey waits for its Jira issue: the wait."""
        row = self.slack_row(self.csm, self.pizza)
        bundle = self.slack_bundle(
            row,
            (
                "jira.create",
                {**self.jira_payload(self.tracker, project="KAN"), "slack_suggestion_id": row.pk},
            ),
            (
                "survey.record",
                {
                    "survey_type": "csat",
                    "subject": "How did we do?",
                    "intro": "",
                    "roles": ["champion"],
                    "timing": "after_jira",
                    "record": "Pizza Hut",
                    "issue": "{{step 1.ticket_key}}",
                    "connector_id": self.tracker.pk,
                },
            ),
        )
        response = self.run_all_steps(self.csm, bundle)
        self.assertEqual(response.status_code, 200, response.content)
        return IssueWait.objects.get()

    def resolved(self, key, status="resolved"):
        return RemoteTicket(external_id=key, title="SSO", number=key, status=status)

    def told(self):
        return list(
            Notification.objects.filter(recipient=self.csm, kind=KIND).values_list(
                "message", flat=True
            )
        )

    # --- becoming due ----------------------------------------------------------
    def test_the_sync_seeing_it_resolved_makes_it_due_and_nothing_else_does(self):
        wait = self.held()
        self.assertEqual(issue_waits.seen(self.tracker, self.resolved(wait.issue_key, "open")), 0)
        other = self.jira_connector(project="ENG")
        self.assertEqual(issue_waits.seen(other, self.resolved(wait.issue_key)), 0)
        # Filed by the sync, matched to no customer: still seen.
        self.assertEqual(
            sync.file_ticket(self.tracker, self.resolved(wait.issue_key))[0], "unmatched"
        )
        wait.refresh_from_db()
        self.assertEqual(wait.status, W.DUE)
        self.assertIsNotNone(wait.resolved_at)

    def test_the_poll_asks_jira_at_most_every_15_minutes(self):
        wait = self.held()
        now = timezone.now()
        issue_waits.poll(now=now)
        wait.refresh_from_db()
        self.assertEqual((wait.status, wait.checked_at), (W.WAITING, now))
        self.jira.statuses[wait.issue_key] = "resolved"
        issue_waits.poll(now=now + timedelta(minutes=5))
        self.assertEqual(self.jira.status_reads, [wait.issue_key])
        issue_waits.poll(now=now + timedelta(minutes=16))
        wait.refresh_from_db()
        self.assertEqual(wait.status, W.DUE)

    def test_an_issue_gone_from_jira_cancels_the_wait_and_tells_its_owner(self):
        wait = self.held()
        self.jira.statuses[wait.issue_key] = None
        issue_waits.poll(now=timezone.now())
        wait.refresh_from_db()
        self.assertEqual((wait.status, wait.detail), (W.CANCELLED, "issue_gone"))
        self.assertEqual(
            self.told(),
            [f"Your survey to Pizza Hut wasn't sent: {wait.issue_key} is no longer in Jira."],
        )

    def test_jira_refusing_the_poll_waits_for_the_next(self):
        wait = self.held()
        self.jira.refuse_next("status", "Jira refused.")
        issue_waits.poll(now=timezone.now())
        wait.refresh_from_db()
        self.assertEqual(wait.status, W.WAITING)

    # --- sending -------------------------------------------------------------
    def due(self):
        wait = self.held()
        IssueWait.objects.filter(pk=wait.pk).update(status=W.DUE, resolved_at=timezone.now())
        return wait

    def test_due_is_sent_once_as_its_owner(self):
        wait = self.due()
        self.assertEqual(issue_waits.send_due(now=timezone.now()), {"sent": 1})
        wait.refresh_from_db()
        self.assertEqual(wait.status, W.SENT)
        send = SurveySend.objects.get(pk=wait.survey_send_id)
        self.assertEqual((send.status, send.owner_id), ("sending", self.csm.pk))
        self.assertEqual(SurveyInvite.objects.filter(send=send).count(), 1)
        self.assertEqual(
            self.told(), [f"Your survey to Pizza Hut was sent: {wait.issue_key} is resolved."]
        )
        self.assertEqual(issue_waits.send_due(now=timezone.now()), {})
        self.assertEqual(SurveyInvite.objects.filter(send=send).count(), 1)
        event = AuditEvent.objects.get(action="issue_wait.sent")
        self.assertEqual(event.metadata, {"issue": wait.issue_key, "action": wait.action_id})

    def test_an_undo_before_it_is_sent_wins(self):
        wait = self.due()
        AgentAction.objects.filter(pk=wait.action_id).update(status="undone")
        self.assertEqual(issue_waits.send_due(now=timezone.now()), {"cancelled": 1})
        self.assertEqual(SurveyInvite.objects.count(), 0)

    def test_undo_after_it_was_sent_is_refused(self):
        wait = self.due()
        issue_waits.send_due(now=timezone.now())
        shown = self.client_for(self.csm).get(f"/api/v1/agents/actions/{wait.action_id}/").json()
        self.assertEqual(shown["undo"]["reason"], "changed_since")
        response = self.client_for(self.csm).post(f"/api/v1/agents/actions/{wait.action_id}/undo/")
        self.assertEqual(
            (response.json()["code"], response.json()["detail"]),
            ("CHANGED_SINCE", "This survey has been sent."),
        )

    def test_the_daily_limit_waits_for_tomorrow(self):
        wait = self.due()
        now = timezone.now()
        with patch(
            "services.surveys.sending.claim", side_effect=Refusal(429, {"detail": "Too many."})
        ):
            self.assertEqual(issue_waits.send_due(now=now), {"due": 1})
        wait.refresh_from_db()
        self.assertEqual((wait.status, wait.detail), (W.DUE, issue_waits.DAILY_LIMIT))
        self.assertEqual(issue_waits.send_due(now=now + timedelta(minutes=1)), {})
        self.assertEqual(issue_waits.send_due(now=now + timedelta(days=1)), {"sent": 1})

    def test_any_other_refusal_ends_it_and_tells_its_owner(self):
        wait = self.due()
        with patch(
            "services.surveys.sending.claim",
            side_effect=Refusal(400, {"segment": ["Nobody to send to."]}),
        ):
            issue_waits.send_due(now=timezone.now())
        wait.refresh_from_db()
        self.assertEqual((wait.status, wait.detail), (W.REFUSED, "Nobody to send to."))
        self.assertEqual(self.told(), ["Your survey to Pizza Hut wasn't sent: Nobody to send to."])

    def test_a_survey_its_owner_sent_meanwhile_is_not_sent_again(self):
        wait = self.due()
        SurveySend.objects.filter(pk=wait.survey_send_id).update(status="sent")
        self.assertEqual(issue_waits.send_due(now=timezone.now()), {"sent": 1})
        self.assertEqual(SurveyInvite.objects.count(), 0)

    def test_a_departed_owner_sends_nothing(self):
        self.due()
        type(self.csm).objects.filter(pk=self.csm.pk).update(is_active=False)
        self.assertEqual(issue_waits.send_due(now=timezone.now()), {"refused": 1})
        self.assertEqual(SurveyInvite.objects.count(), 0)

    # --- expiry and the tick --------------------------------------------------
    def test_ninety_days_without_a_resolution_expires_it(self):
        wait = self.held()
        IssueWait.objects.filter(pk=wait.pk).update(created_at=timezone.now() - timedelta(days=91))
        issue_waits.expire_old(now=timezone.now())
        wait.refresh_from_db()
        self.assertEqual(wait.status, W.EXPIRED)
        self.assertEqual(
            self.told(),
            [
                f"Your survey to Pizza Hut wasn't sent: {wait.issue_key} "
                "wasn't resolved within 90 days."
            ],
        )

    def test_a_part_failing_never_stops_the_others(self):
        wait = self.due()
        with patch.object(issue_waits, "poll", side_effect=RuntimeError("boom")):
            counts = issue_waits.run_due(now=timezone.now())
        self.assertEqual(counts["sent"], {"sent": 1})
        wait.refresh_from_db()
        self.assertEqual(wait.status, W.SENT)

    def test_the_owner_who_cant_open_the_record_is_told_without_its_name(self):
        wait = self.held()
        self.jira.statuses[wait.issue_key] = None
        from services.customers.models import Customer

        Customer.objects.filter(pk=self.pizza.pk).update(owner=self.mona)
        from services.customers.models import Account

        Account.objects.filter(pk=self.emea.pk).update(owner=self.mona)
        issue_waits.poll(now=timezone.now())
        self.assertEqual(
            self.told(), [f"Your survey wasn't sent: {wait.issue_key} is no longer in Jira."]
        )


class JiraStatusTests(SlackBundleFixture):
    def test_the_status_is_read_from_its_category_and_a_missing_issue_is_none(self):
        from services.agents.outside import tools
        from services.connectors.tests.jira_fake import use_jira

        api = use_jira(self)
        connector = self.jira_connector()
        tool = tools.JiraTool()
        self.assertEqual(tool.status(connector, issue="SUP-12"), "open")
        api.issues["SUP-12"]["category"] = "done"
        self.assertEqual(tool.status(connector, issue="SUP-12"), "resolved")
        self.assertIsNone(tool.status(connector, issue="SUP-404"))
        api.refuse_next("GET .*/issue/SUP-12", 500)
        with self.assertRaises(tools.Refused):
            tool.status(connector, issue="SUP-12")
