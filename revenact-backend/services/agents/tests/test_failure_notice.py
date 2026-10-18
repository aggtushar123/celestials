"""A failed step tells its runner (agent bundles D3 contract §7, D3-15;
spec §8.3). Jira is a fake."""

from datetime import timedelta

from django.utils import timezone

from services.agents.bundles import settle_stuck
from services.agents.models import AgentBundle
from services.agents.tests.outside_fixtures import OutsideFixture
from services.notifications.models import Notification

KIND = Notification.Kind.AGENT_STEP_FAILED
REFUSED = "Jira says the project SUP needs a component."
BUSY = "Jira is busy. Retry in a minute."


class FailureNoticeTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector()
        _, self.thread = self.slack_thread(self.pizza)

    def test_one_failed_step(self):
        bundle = self.outside_bundle(self.thread, ("jira.create", self.jira_payload(self.board)))
        self.jira.refuse_next("create", REFUSED)
        self.run_all_steps(self.csm, bundle)
        notice = Notification.objects.get(kind=KIND)
        self.assertEqual(notice.recipient, self.csm)
        self.assertIsNone(notice.actor)
        self.assertEqual(
            notice.message,
            f"Step 1 failed in “Pizza Hut: login loop”: {REFUSED}",
        )
        self.assertEqual(notice.link, f"/work?queue=history&bundle={bundle.pk}")

    def test_several_failed_steps_are_one_notice(self):
        bundle = self.outside_bundle(
            self.thread,
            ("jira.create", self.jira_payload(self.board)),
            (
                "jira.assign",
                self.assign_payload(self.board, "{{step 1.ticket_key}}", member=self.erin.pk),
            ),
        )
        self.jira.refuse_next("create", REFUSED)
        self.run_all_steps(self.csm, bundle)
        self.assertEqual(
            list(Notification.objects.filter(kind=KIND).values_list("message", flat=True)),
            ["2 steps failed in “Pizza Hut: login loop”."],
        )

    def test_a_retry_that_fails_again_tells_again_and_success_tells_nothing(self):
        bundle = self.outside_bundle(self.thread, ("jira.create", self.jira_payload(self.board)))
        self.jira.refuse_next("create", BUSY)
        self.run_all_steps(self.csm, bundle)
        step = bundle.steps.get()
        self.jira.refuse_next("create", BUSY)
        self.retry(self.csm, step)
        self.assertEqual(Notification.objects.filter(kind=KIND).count(), 2)
        self.retry(self.csm, step)
        self.assertEqual(Notification.objects.filter(kind=KIND).count(), 2)

    def test_a_retry_by_someone_else_tells_the_original_runner(self):
        # A retry does not claim the bundle, so `run_by` stays the person who
        # ran it; contract §7 sends the notice to that runner (ruling P8).
        bundle = self.outside_bundle(self.thread, ("jira.create", self.jira_payload(self.board)))
        self.jira.refuse_next("create", BUSY)
        self.run_all_steps(self.csm, bundle)
        step = bundle.steps.get()
        self.jira.refuse_next("create", BUSY)
        self.assertEqual(self.retry(self.admin, step).status_code, 200)
        bundle.refresh_from_db()
        self.assertEqual(bundle.run_by, self.csm)
        self.assertEqual(
            list(Notification.objects.filter(kind=KIND).values_list("recipient", flat=True)),
            [self.csm.pk, self.csm.pk],
        )

    def test_an_auto_bundle_has_no_runner_to_tell(self):
        bundle = self.outside_bundle(self.thread, ("jira.create", self.jira_payload(self.board)))
        self.jira.refuse_next("create", BUSY)
        self.run_all_steps(self.csm, bundle)
        AgentBundle.objects.filter(pk=bundle.pk).update(run_by=None)
        self.jira.refuse_next("create", BUSY)
        self.retry(self.admin, bundle.steps.get())
        self.assertEqual(Notification.objects.filter(kind=KIND).count(), 1)

    def test_title_and_message_are_cut(self):
        bundle = self.outside_bundle(self.thread, ("jira.create", self.jira_payload(self.board)))
        AgentBundle.objects.filter(pk=bundle.pk).update(title="T" * 200)
        self.jira.refuse_next("create", "x" * 600)
        self.run_all_steps(self.csm, bundle)
        message = Notification.objects.get(kind=KIND).message
        self.assertEqual(len(message), 500)
        self.assertTrue(message.startswith("Step 1 failed in “" + "T" * 120 + "”: "))

    def test_a_settled_stuck_run_tells_its_runner(self):
        bundle = self.outside_bundle(self.thread, ("jira.create", self.jira_payload(self.board)))
        AgentBundle.objects.filter(pk=bundle.pk).update(
            status=AgentBundle.Status.RUNNING,
            run_by=self.csm,
            run_started_at=timezone.now() - timedelta(minutes=20),
        )
        settle_stuck(AgentBundle.objects.get(pk=bundle.pk))
        notice = Notification.objects.get(kind=KIND)
        self.assertEqual(notice.recipient, self.csm)
        self.assertEqual(
            notice.message,
            "Step 1 failed in “Pizza Hut: login loop”: This step didn't finish. Retry it.",
        )

    def test_a_database_error_in_the_notice_leaves_the_callers_transaction_usable(self):
        from unittest.mock import patch

        from django.db import connection

        from services.agents import failure_notice

        bundle = self.outside_bundle(self.thread, ("jira.create", self.jira_payload(self.board)))
        self.jira.refuse_next("create", REFUSED)
        self.run_all_steps(self.csm, bundle)
        step = bundle.steps.get()

        def broken(**kwargs):
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 / 0")

        with patch.object(failure_notice, "notify", side_effect=broken):
            with self.assertLogs("services.agents.failure_notice", level="WARNING"):
                self.assertIsNone(failure_notice.tell(bundle.pk, self.csm.pk, [step.pk]))
        # The caller's (this test's) transaction still answers.
        self.assertEqual(Notification.objects.filter(kind=KIND).count(), 1)
