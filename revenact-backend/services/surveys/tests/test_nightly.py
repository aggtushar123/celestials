"""The nightly refresh: a record whose answers have just aged past 90 days
gets its rolling figure again, from a run_health_maintenance step that
never stops the job."""

import logging
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.surveys import scores
from services.surveys.models import SurveySend
from services.surveys.scores import refresh_aged
from services.surveys.tests.fixtures import SurveyFixture, contact


class RefreshAgedTests(SurveyFixture):
    def test_an_answer_that_just_aged_out_no_longer_counts(self):
        send = self.make_send()
        self.answered(send, self.ann, 0, days_ago=92)
        self.answered(send, contact(self.pizza, "Pia"), 10, days_ago=10)
        self.pizza.nps_score = 0  # what both answers made it while both were live
        self.pizza.save(update_fields=["nps_score"])
        self.assertEqual(refresh_aged(now=self.now), 1)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 100)

    def test_answers_long_gone_are_not_looked_at_again(self):
        self.answered(self.make_send(), self.ann, 0, days_ago=120)
        self.assertEqual(refresh_aged(now=self.now), 0)

    def test_a_record_with_nothing_live_keeps_its_score(self):
        self.pizza.nps_score = 40
        self.pizza.save(update_fields=["nps_score"])
        self.answered(self.make_send(), self.ann, 0, days_ago=92)
        self.assertEqual(refresh_aged(now=self.now), 1)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 40)

    def test_an_account_answer_refreshes_the_account_and_its_organisation(self):
        send = self.make_send()
        self.answered(send, self.ben, 0, days_ago=92)
        self.answered(send, contact(self.emea, "Eli"), 10, days_ago=5)
        self.assertEqual(refresh_aged(now=self.now), 2)
        self.pizza.refresh_from_db()
        self.emea.refresh_from_db()
        self.assertEqual((self.pizza.nps_score, self.emea.nps_score), (100, 100))

    def test_one_workspace_at_a_time(self):
        theirs = SurveySend.objects.create(
            organisation=self.other_org,
            owner=self.stranger,
            name="Globex NPS",
            survey_type="nps",
            subject="s",
        )
        self.answered(theirs, contact(self.globex, "Gil"), 0, days_ago=92)
        self.answered(self.make_send(), self.ann, 0, days_ago=92)
        self.assertEqual(refresh_aged(self.org, now=self.now), 1)

    def test_one_record_failure_does_not_stop_the_rest(self):
        send = self.make_send()
        self.answered(send, self.ann, 0, days_ago=92)  # aged: scores Pizza Hut
        self.answered(send, self.ben, 0, days_ago=92)  # aged: scores Pizza EMEA, Pizza Hut
        self.answered(send, contact(self.emea, "Eli"), 10, days_ago=5)  # live: 100 for both
        pizza_refreshes = [0]
        real_refresh = scores.refresh

        def fail_pizza_once(record, survey_type, *, now):
            if isinstance(record, scores.Customer) and record.pk == self.pizza.pk:
                pizza_refreshes[0] += 1
                if pizza_refreshes[0] == 1:
                    raise RuntimeError("pizza refresh failed")
            return real_refresh(record, survey_type, now=now)

        with patch.object(scores, "refresh", side_effect=fail_pizza_once):
            with self.assertLogs(level=logging.ERROR) as logs:
                count = refresh_aged(now=self.now)
        # Pizza Hut fails once and is retried through the other aged invite;
        # Pizza EMEA is refreshed either way. Both records are re-read.
        self.assertEqual((count, pizza_refreshes[0]), (2, 2))
        self.pizza.refresh_from_db()
        self.emea.refresh_from_db()
        self.assertEqual((self.pizza.nps_score, self.emea.nps_score), (100, 100))
        self.assertEqual(len(logs.output), 1)
        self.assertIn("refresh_aged failed", logs.output[0])
        self.assertIn("Customer", logs.output[0])
        # the class name only: no exception text, no traceback
        self.assertIn("RuntimeError", logs.output[0])
        self.assertNotIn("pizza refresh failed", logs.output[0])
        self.assertNotIn("Traceback", logs.output[0])

    def test_refresh_takes_row_locks_via_select_for_update(self):
        send = self.make_send()
        self.answered(send, self.ann, 0, days_ago=92)
        with CaptureQueriesContext(connection) as ctx:
            refresh_aged(now=self.now)
        locks = [
            query["sql"] for query in ctx.captured_queries if "FOR NO KEY UPDATE" in query["sql"]
        ]
        self.assertTrue(locks, "refresh_aged should lock the Customer rows (FOR NO KEY UPDATE)")


class MaintenanceStepTests(SurveyFixture):
    def run_job(self, *args):
        out = StringIO()
        call_command("run_health_maintenance", *args, org_email="alice@acme.io", stdout=out)
        return out.getvalue()

    def test_the_nightly_job_runs_the_refresh_for_its_workspace(self):
        with patch.object(scores, "refresh_aged", return_value=3) as step:
            output = self.run_job()
        self.assertEqual(step.call_args.args, (self.org,))
        self.assertIn("refreshed survey scores on 3 record(s)", output)

    def test_a_dry_run_skips_it(self):
        with patch.object(scores, "refresh_aged") as step:
            self.run_job("--dry-run")
        step.assert_not_called()

    def test_a_failure_is_reported_and_the_job_goes_on(self):
        with patch.object(scores, "refresh_aged", side_effect=RuntimeError("boom")):
            output = self.run_job()
        self.assertIn("survey scores skipped: boom", output)
        self.assertIn("segment(s)", output)
