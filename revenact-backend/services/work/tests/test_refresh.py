"""One pass of the recommender (spec §2.2, §5, §6): one open recommendation
per triggering record, routed; refreshed in place; expired when its signal
stops; held back by a recent decision unless the signal got worse; one
source failing never stops the others; each recipient told once a day; and
the nightly job runs it before the rules."""

from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.db import IntegrityError, connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.customers.models import Customer, Task, Ticket
from services.notifications.models import Notification
from services.rules import nightly as rules_nightly
from services.rules.nightly import RulesResult
from services.work import recommend, sources
from services.work.models import Recommendation
from services.work.recommend import RefreshResult, refresh, refresh_all, waiting_message
from services.work.routing import Router
from services.work.tests.recommend_fixtures import RecommendFixture, record_link


def short(value):
    return f"{value.day} {value:%b}"


def recommendation_queries(captured, verb):
    return [
        q["sql"]
        for q in captured.captured_queries
        if q["sql"].startswith(verb) and '"work_recommendation"' in q["sql"]
    ]


def meanwhile(action):
    """Route as usual, after `action(signal)` runs: something another
    request does between the refresh's read and its write."""
    real = Router.route

    def route(router, signal):
        action(signal)
        return real(router, signal)

    return patch.object(Router, "route", autospec=True, side_effect=route)


class RefreshTests(RecommendFixture):
    def test_each_triggering_record_gets_one_open_recommendation_routed(self):
        self.only("renewal_due", days=30)
        result = self.refresh_now()
        self.assertEqual(
            (result.created, result.updated, result.expired, result.failed), (2, 0, 0, [])
        )
        dough = self.recs(customer=self.dough).get()
        self.assertEqual(
            (dough.kind, dough.status, dough.title, dough.account),
            ("renewal_due", "open", "Prepare Dough Co's renewal", None),
        )
        self.assertEqual(
            (dough.suggested_assignee, dough.recipient, dough.signal_value),
            (self.csm, self.mona, 30.0),
        )
        renews = self.today + timedelta(days=30)
        self.assertEqual(
            dough.why,
            {
                "facts": ["Renews in 30 days", f"Renewal date {short(renews)}"],
                "evidence": [{"label": "Dough Co", "link": record_link(self.dough)}],
            },
        )
        taco = self.recs(customer=self.taco).get()
        self.assertEqual((taco.suggested_assignee, taco.recipient), (self.other, self.other))

    def test_running_twice_changes_nothing(self):
        self.only("renewal_due")
        self.refresh_now()
        before = sorted(self.recs().values_list("id", "status", "signal_value", "recipient"))
        with CaptureQueriesContext(connection) as captured:
            result = self.refresh_now()
        self.assertEqual((result.created, result.updated, result.expired), (0, 0, 0))
        self.assertEqual(recommendation_queries(captured, "UPDATE"), [])
        after = sorted(self.recs().values_list("id", "status", "signal_value", "recipient"))
        self.assertEqual(after, before)

    def test_an_open_one_is_refreshed_in_place_and_rerouted(self):
        self.only("renewal_due")
        self.refresh_now()
        Customer.objects.filter(pk=self.dough.pk).update(
            renewal_date=self.today + timedelta(days=9), owner=self.mona
        )
        self.refresh_now()
        dough = self.recs(customer=self.dough).get()
        self.assertEqual((dough.signal_value, dough.why["facts"][0]), (9.0, "Renews in 9 days"))
        self.assertEqual((dough.suggested_assignee, dough.recipient), (self.mona, self.mona))

    def test_a_signal_that_stops_expires_its_recommendation(self):
        self.only("renewal_due")
        self.refresh_now()
        Customer.objects.filter(pk=self.dough.pk).update(
            renewal_date=self.today + timedelta(days=90)
        )
        self.assertEqual(self.refresh_now().expired, 1)
        dough = self.recs(customer=self.dough).get()
        self.assertEqual((dough.status, dough.decided_by), ("expired", None))
        self.assertIsNotNone(dough.decided_at)

    def test_turning_a_source_off_expires_its_open_ones(self):
        self.only("renewal_due")
        self.refresh_now()
        self.only("urgent_tickets")
        self.assertEqual(self.refresh_now().expired, 2)
        self.assertFalse(self.recs(status="open").exists())

    def test_nobody_able_to_receive_it_is_counted_and_retried(self):
        self.only("renewal_due")
        Customer.objects.filter(pk=self.loose.pk).update(renewal_date=self.today)
        self.admin.is_active = False
        self.admin.save(update_fields=["is_active"])
        result = self.refresh_now()
        self.assertEqual((result.created, result.unrouted), (2, 1))
        self.assertFalse(self.recs(customer=self.loose).exists())

    def test_an_open_one_nobody_can_now_receive_expires(self):
        self.only("renewal_due")
        Customer.objects.filter(pk=self.loose.pk).update(renewal_date=self.today)
        self.refresh_now()
        loose = self.recs(customer=self.loose).get()
        self.assertEqual((loose.status, loose.recipient), ("open", self.admin))
        # Alice, Loose Ltd's only fallback, can no longer open it.
        self.admin.is_active = False
        self.admin.save(update_fields=["is_active"])
        Notification.objects.all().delete()
        result = self.refresh_now(today=self.today + timedelta(days=1))
        self.assertEqual((result.unrouted, result.expired, result.created), (1, 1, 0))
        loose.refresh_from_db()
        self.assertEqual(loose.status, "expired")
        self.assertFalse(Notification.objects.filter(recipient=self.admin).exists())
        # Someone able to take it again gets a fresh one on the next run.
        self.admin.is_active = True
        self.admin.save(update_fields=["is_active"])
        self.refresh_now(today=self.today + timedelta(days=1))
        self.assertEqual(self.recs(customer=self.loose, status="open").get().recipient, self.admin)


class RaceTests(RecommendFixture):
    """Another request deciding or inserting between the refresh's read and
    its write."""

    def test_one_decided_after_the_read_is_not_overwritten(self):
        self.only("renewal_due")
        self.refresh_now()
        Customer.objects.filter(pk=self.dough.pk).update(
            renewal_date=self.today + timedelta(days=9)
        )

        def dismiss(signal):
            if signal.customer.pk == self.dough.pk:
                self.recs(customer=self.dough).update(
                    status="dismissed", decided_by=self.mona, decided_at=timezone.now()
                )

        with meanwhile(dismiss):
            result = self.refresh_now()
        self.assertEqual(result.updated, 0)
        dough = self.recs(customer=self.dough).get()
        self.assertEqual((dough.status, dough.signal_value), ("dismissed", 30.0))

    def test_only_what_was_still_open_counts_as_expired(self):
        self.only("renewal_due")
        self.refresh_now()
        Customer.objects.filter(pk=self.taco.pk).update(
            renewal_date=self.today + timedelta(days=90)
        )

        def dismiss_taco(signal):
            self.recs(customer=self.taco).update(
                status="dismissed", decided_by=self.other, decided_at=timezone.now()
            )

        with meanwhile(dismiss_taco):
            result = self.refresh_now()
        self.assertEqual(result.expired, 0)
        self.assertEqual(self.recs(customer=self.taco).get().status, "dismissed")

    def test_losing_the_insert_to_a_concurrent_run_is_skipped(self):
        self.only("renewal_due")

        def insert_first(signal):
            if signal.customer.pk == self.dough.pk:
                self.make_rec(on=self.dough, recipient=self.mona, value=30)

        with meanwhile(insert_first):
            result = self.refresh_now()
        self.assertEqual((result.created, result.failed), (1, []))
        self.assertEqual(self.recs(customer=self.dough, status="open").count(), 1)

    def test_any_other_integrity_error_fails_the_source(self):
        self.only("renewal_due")
        with (
            patch.object(Recommendation.objects, "create", side_effect=IntegrityError("not null")),
            self.assertLogs("services.work.recommend", "WARNING"),
        ):
            result = self.refresh_now()
        self.assertEqual((result.failed, result.created), (["renewal_due"], 0))


class HeldBackTests(RecommendFixture):
    def decided(self, on, *, value, days_ago, status="dismissed", kind="renewal_due", task=None):
        return self.make_rec(
            kind,
            on=on,
            recipient=self.mona,
            status=status,
            value=value,
            decided_by=self.mona,
            decided_at=timezone.now() - timedelta(days=days_ago),
            task=task,
        )

    def opened(self, on):
        return self.recs(customer=on, status="open").exists()

    def test_a_dismissal_holds_the_same_signal_back_for_the_cooldown(self):
        self.only("renewal_due")
        self.decided(self.dough, value=31, days_ago=13)
        self.refresh_now()
        self.assertFalse(self.opened(self.dough))
        self.recs(customer=self.dough).update(decided_at=timezone.now() - timedelta(days=15))
        self.refresh_now()
        self.assertTrue(self.opened(self.dough))

    def test_a_renewal_that_becomes_overdue_comes_back_inside_the_cooldown(self):
        self.only("renewal_due")
        self.decided(self.dough, value=3, days_ago=1)
        Customer.objects.filter(pk=self.dough.pk).update(
            renewal_date=self.today - timedelta(days=1)
        )
        self.refresh_now()
        self.assertEqual(self.recs(customer=self.dough, status="open").get().signal_value, -1.0)

    def test_more_tickets_than_when_dismissed_comes_back(self):
        self.only("urgent_tickets")
        for number in (1, 2):
            Ticket.objects.create(
                customer=self.taco,
                ticket_number=f"TKT-{number}",
                title="Down",
                assignee_name="Support",
                priority="high",
                opened_at=self.today,
            )
        self.decided(self.taco, value=2, days_ago=1, kind="urgent_tickets")
        self.refresh_now()
        self.assertFalse(self.opened(self.taco))
        Ticket.objects.create(
            customer=self.taco,
            ticket_number="TKT-3",
            title="Down",
            assignee_name="Support",
            priority="critical",
            opened_at=self.today,
        )
        self.refresh_now()
        self.assertEqual(self.recs(customer=self.taco, status="open").get().signal_value, 3.0)

    def test_a_cooldown_of_zero_holds_nothing_back(self):
        self.only("renewal_due")
        self.prefer(dismiss_cooldown_days=0)
        self.decided(self.dough, value=30, days_ago=0)
        self.refresh_now()
        self.assertTrue(self.opened(self.dough))

    def test_an_assignment_holds_back_while_its_task_is_open(self):
        self.only("renewal_due")
        task = Task.objects.create(
            customer=self.dough,
            title="Prepare Dough Co's renewal",
            assignee=self.csm,
            created_by=self.mona,
            due_date=self.today,
            priority="high",
        )
        self.decided(self.dough, value=30, days_ago=30, status="assigned", task=task)
        self.refresh_now()
        self.assertFalse(self.opened(self.dough))
        Task.objects.filter(pk=task.pk).update(status="completed")
        self.refresh_now()
        self.assertTrue(self.opened(self.dough))

    def test_the_earlier_decisions_are_read_in_one_query_however_many_records(self):
        self.only("renewal_due")
        Customer.objects.filter(pk=self.taco.pk).update(renewal_date=None)

        def decisions_read():
            with CaptureQueriesContext(connection) as captured:
                self.refresh_now()
            self.assertFalse(self.recs(status="open").exists())  # every one held back
            reads = recommendation_queries(captured, "SELECT")
            return [sql for sql in reads if "dismissed" in sql]

        self.decided(self.dough, value=30, days_ago=1)
        one = decisions_read()
        for record in (self.pizza, self.soup):
            Customer.objects.filter(pk=record.pk).update(
                renewal_date=self.today + timedelta(days=30)
            )
            self.decided(record, value=30, days_ago=1)
        three = decisions_read()
        self.assertEqual(len(one), 1)
        self.assertEqual(len(three), len(one))

    def test_worse_by_kind(self):
        params = {"drop": 0.5}
        self.assertTrue(recommend.worse("renewal_due", -1, 3, params))
        self.assertFalse(recommend.worse("renewal_due", 2, 30, params))
        self.assertFalse(recommend.worse("renewal_due", -5, -1, params))
        self.assertTrue(recommend.worse("health_drop", 1.1, 0.6, params))
        self.assertFalse(recommend.worse("health_drop", 1.0, 0.6, params))
        self.assertTrue(recommend.worse("overdue_tasks", 3, 2, params))
        self.assertFalse(recommend.worse("open_questions", 2, 2, params))
        self.assertFalse(recommend.worse("agent", None, None, params))


class FailureTests(RecommendFixture):
    def test_one_source_failing_never_stops_the_others(self):
        Ticket.objects.create(
            customer=self.taco,
            ticket_number="TKT-1",
            title="Down",
            assignee_name="Support",
            priority="high",
            opened_at=self.today,
        )

        def boom(book, params):
            raise RuntimeError("Dough Co exploded")

        with (
            patch.dict(sources.SOURCES, {"renewal_due": boom}),
            self.assertLogs("services.work.recommend", "WARNING") as logs,
        ):
            result = self.refresh_now()
        self.assertEqual(result.failed, ["renewal_due"])
        self.assertEqual(list(self.recs().values_list("kind", flat=True)), ["urgent_tickets"])
        self.assertNotIn("Dough Co", "\n".join(logs.output))

    def test_a_failing_source_writes_nothing_of_its_own(self):
        self.only("renewal_due")
        real = sources.SOURCES["renewal_due"]

        def half(book, params):
            found = real(book, params)
            return [*found, None]  # the second write fails after the first

        with (
            patch.dict(sources.SOURCES, {"renewal_due": half}),
            self.assertLogs("services.work.recommend", "WARNING"),
        ):
            result = self.refresh_now()
        self.assertEqual((result.failed, result.created), (["renewal_due"], 0))
        self.assertFalse(self.recs().exists())

    def test_every_workspace_and_one_failing_never_stops_the_next(self):
        Customer.objects.filter(pk=self.globex.pk).update(renewal_date=self.today)
        real = sources.load_book

        def flaky(organisation, **kwargs):
            if organisation.pk == self.org.pk:
                raise RuntimeError("Acme")
            return real(organisation, **kwargs)

        with (
            patch.object(sources, "load_book", side_effect=flaky),
            self.assertLogs("services.work.recommend", "WARNING"),
        ):
            result = refresh_all(today=self.today)
        self.assertEqual(result.failed, [f"organisation {self.org.pk}"])
        [only] = recommend.Recommendation.objects.all()
        self.assertEqual((only.customer, only.recipient), (self.globex, self.stranger))


class WaitingNoticeTests(RecommendFixture):
    def notices(self, who):
        return list(
            Notification.objects.filter(recipient=who, kind="recommendations_waiting").values_list(
                "message", "link", "actor"
            )
        )

    def test_each_recipient_is_told_once_about_their_new_items(self):
        self.only("renewal_due")
        Customer.objects.filter(pk=self.pizza.pk).update(
            renewal_date=self.today + timedelta(days=5)
        )
        result = self.refresh_now()
        self.assertEqual(result.notified, 2)
        # Mona receives Carl's Dough Co and Pizza Hut; Dana her own Taco Bell.
        self.assertEqual(
            self.notices(self.mona),
            [("2 tasks recommended for your team.", "/work/mine?kind=suggestion", None)],
        )
        self.assertEqual(
            self.notices(self.other),
            [
                (
                    "Revenact recommends “Prepare Taco Bell's renewal”.",
                    "/work/mine?kind=suggestion",
                    None,
                )
            ],
        )
        self.assertEqual(self.notices(self.csm), [])

    def test_in_owner_mode_they_are_for_you(self):
        self.only("renewal_due")
        self.prefer(recommend_to="owner")
        Customer.objects.filter(pk=self.pizza.pk).update(
            renewal_date=self.today + timedelta(days=5)
        )
        self.refresh_now()
        self.assertEqual(self.notices(self.csm)[0][0], "2 tasks recommended for you.")

    def test_at_most_once_a_day(self):
        self.only("renewal_due")
        self.refresh_now()
        Customer.objects.filter(pk=self.pizza.pk).update(
            renewal_date=self.today + timedelta(days=5)
        )
        self.refresh_now()
        self.assertEqual(self.recs(customer=self.pizza).count(), 1)
        self.assertEqual(len(self.notices(self.mona)), 1)
        Customer.objects.filter(pk=self.soup.pk).update(renewal_date=self.today + timedelta(days=5))
        self.refresh_now(today=self.today + timedelta(days=1))
        self.assertEqual(len(self.notices(self.mona)), 2)

    def test_nothing_new_tells_nobody(self):
        self.only("renewal_due")
        self.refresh_now()
        Notification.objects.all().delete()
        self.refresh_now(today=self.today + timedelta(days=1))
        self.assertFalse(Notification.objects.exists())

    def test_the_person_who_ran_it_is_never_told(self):
        self.only("renewal_due")
        result = refresh(self.org, today=self.today, actor=self.mona)
        self.assertEqual(result.notified, 1)
        self.assertEqual(self.notices(self.mona), [])
        self.assertEqual(len(self.notices(self.other)), 1)

    def test_a_failing_notice_keeps_the_counts(self):
        self.only("renewal_due")
        with (
            patch.object(recommend, "notify_waiting", side_effect=RuntimeError("Dough Co")),
            self.assertLogs("services.work.recommend", "WARNING") as logs,
        ):
            result = self.refresh_now()
        self.assertEqual((result.created, result.notified), (2, 0))
        self.assertEqual(result.failed, ["recommendations_waiting"])
        self.assertEqual(self.recs(status="open").count(), 2)
        self.assertNotIn("Dough Co", "\n".join(logs.output))

    def reroute_dough_to_dana(self):
        self.only("renewal_due")
        self.refresh_now()
        Notification.objects.all().delete()
        Customer.objects.filter(pk=self.dough.pk).update(owner=self.other)

    def test_a_row_rerouted_to_someone_new_is_news_to_them(self):
        self.reroute_dough_to_dana()
        result = self.refresh_now()
        self.assertEqual((result.created, result.updated, result.notified), (0, 1, 1))
        self.assertEqual(self.recs(customer=self.dough).get().recipient, self.other)
        self.assertEqual(
            self.notices(self.other),
            [
                (
                    "Revenact recommends “Prepare Dough Co's renewal”.",
                    "/work/mine?kind=suggestion",
                    None,
                )
            ],
        )
        self.assertEqual(self.notices(self.mona), [])

    def test_a_rerouted_row_is_still_told_at_most_once_a_day(self):
        self.reroute_dough_to_dana()
        Notification.objects.create(
            recipient=self.other,
            kind="recommendations_waiting",
            message="1 task recommended for you.",
            link="/work/mine?kind=suggestion",
        )
        self.assertEqual(self.refresh_now().notified, 0)
        self.assertEqual(len(self.notices(self.other)), 1)

    def test_a_rerouted_row_never_tells_the_person_who_ran_it(self):
        self.reroute_dough_to_dana()
        result = refresh(self.org, today=self.today, actor=self.other)
        self.assertEqual((result.updated, result.notified), (1, 0))
        self.assertEqual(self.notices(self.other), [])

    def test_a_row_refreshed_for_the_same_recipient_is_no_news(self):
        self.only("renewal_due")
        self.refresh_now()
        Notification.objects.all().delete()
        Customer.objects.filter(pk=self.dough.pk).update(
            renewal_date=self.today + timedelta(days=9)
        )
        result = self.refresh_now()
        self.assertEqual((result.updated, result.notified), (1, 0))

    def test_a_record_is_named_only_to_someone_who_may_open_it(self):
        west = self.make_rec(on=self.west, recipient=self.csm, title="Prepare Taco West's renewal")
        self.assertEqual(waiting_message(self.csm, [west]), "1 task recommended for your team.")
        mine = self.make_rec(on=self.pizza, recipient=self.csm, suggested=self.csm)
        self.assertEqual(
            waiting_message(self.csm, [mine]), "Revenact recommends “Prepare Pizza Hut's renewal”."
        )


class MaintenanceStepTests(RecommendFixture):
    def run_job(self):
        out = StringIO()
        call_command("run_health_maintenance", org_email="alice@acme.io", stdout=out)
        return out.getvalue()

    def test_recommendations_run_before_the_rules(self):
        calls = []

        def step(name, value):
            return lambda *args, **kwargs: calls.append(name) or value

        with (
            patch.object(
                recommend, "refresh_all", side_effect=step("work", RefreshResult(created=3))
            ) as work,
            patch.object(rules_nightly, "evaluate_rules", side_effect=step("rules", RulesResult())),
        ):
            output = self.run_job()
        self.assertEqual(calls, ["work", "rules"])
        self.assertEqual(work.call_args.args, (self.org,))
        self.assertIn("recommended 3 task(s): 0 refreshed, 0 expired, 0 told, 0 failure(s)", output)

    def test_a_failure_is_reported_never_fatal(self):
        with (
            patch.object(recommend, "refresh_all", side_effect=RuntimeError("Dough Co")),
            patch.object(rules_nightly, "evaluate_rules", return_value=RulesResult()) as rules,
        ):
            output = self.run_job()
        # the class name only: an exception's text can quote a row's values
        self.assertIn("recommendations skipped: RuntimeError\n", output)
        rules.assert_called_once()
