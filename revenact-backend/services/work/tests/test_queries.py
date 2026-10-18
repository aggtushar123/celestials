"""Postgres 16 plans a join made unique with DISTINCT badly (about a second
a call; services.customers.scoping). No Work query, and no task-panel or task
list query, may use DISTINCT."""

from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.accounts.models import Organisation, User
from services.anomalies.models import Anomaly, AnomalyEvidence
from services.brain.scope import available, resolve
from services.customers.models import HealthSnapshot, Task, Ticket
from services.customers.task_access import openable_tasks
from services.customers.task_payloads import DETAIL_RELATED, task_detail
from services.customers.views import TaskListView
from services.work import assignees, drill, feed, prefs, recommendations, team
from services.work.feed_shape import KINDS
from services.work.models import LIVE_KINDS, Recommendation
from services.work.rec_access import SCOPES
from services.work.recommend import refresh
from services.work.states import STATES
from services.work.tests.fixtures import WorkFixture


class QueryShapeTests(WorkFixture):
    def test_no_distinct_in_any_work_query(self):
        for reader in (self.csm, self.mona, self.admin, self.lee):
            reader = User.objects.get(pk=reader.pk)
            with CaptureQueriesContext(connection) as queries:
                feed.build(reader, today=self.today, kinds=frozenset(KINDS))
                for key in available(reader):
                    team.build(reader, resolve(reader, key), today=self.today)
                for state in STATES:
                    drill.build(reader, self.csm.pk, state, today=self.today)
                assignees.build(reader, self.pizza)
                rows = openable_tasks(reader, Task.objects.filter(pk=self.overdue.pk))
                task = rows.select_related(*DETAIL_RELATED).first()
                if task is not None:
                    task_detail(task, reader)
            self.assertTrue(queries.captured_queries)
            for query in queries.captured_queries:
                self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])

    def test_the_task_list_no_longer_uses_distinct(self):
        for mine in ("true", ""):
            view = TaskListView()
            view.request = SimpleNamespace(
                user=User.objects.get(pk=self.mona.pk), query_params={"mine": mine}
            )
            self.assertNotIn("DISTINCT", str(view.get_queryset().query).upper())

    def test_no_distinct_in_any_recommendation_query(self):
        """Every source, the routing, the list, the settings and both
        decisions, with data behind every source."""
        now = timezone.now()
        Ticket.objects.create(
            customer=self.taco,
            ticket_number="TKT-1",
            title="Down",
            assignee_name="Support",
            priority="high",
            opened_at=self.today,
        )
        HealthSnapshot.objects.create(
            customer=self.pizza,
            captured_on=self.today - timedelta(days=20),
            health_score=Decimal("9.0"),
        )
        anomaly = Anomaly.objects.create(
            organisation=self.org, title="Logins", first_seen_at=now, last_seen_at=now
        )
        AnomalyEvidence.objects.create(
            anomaly=anomaly,
            organisation=self.org,
            kind="ticket",
            record_id=1,
            customer=self.pizza,
            snippet="x",
            occurred_at=now,
        )
        organisation = Organisation.objects.get(pk=self.org.pk)
        admin = self.as_user(User.objects.get(pk=self.admin.pk))
        with CaptureQueriesContext(connection) as queries:
            result = refresh(organisation, today=self.today)
            for reader in (self.csm, self.mona, self.admin, self.lee):
                reader = User.objects.get(pk=reader.pk)
                for scope in SCOPES:
                    recommendations.build(reader, scope, today=self.today)
                prefs.payload(prefs.settings_for(organisation), reader)
            first, second = Recommendation.objects.filter(status="open").order_by("id")[:2]
            assigned = admin.post(
                f"/api/v1/work/recommendations/{first.pk}/assign/",
                {"assignee_id": first.suggested_assignee_id or self.admin.pk},
                format="json",
            )
            dismissed = admin.post(
                f"/api/v1/work/recommendations/{second.pk}/dismiss/",
                {"reason": "not_relevant"},
                format="json",
            )
        self.assertEqual(result.failed, [])
        self.assertEqual(
            set(Recommendation.objects.values_list("kind", flat=True)), set(LIVE_KINDS)
        )
        self.assertEqual((assigned.status_code, dismissed.status_code), (201, 200))
        for query in queries.captured_queries:
            self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])

    def test_no_distinct_in_tracking_or_the_digest(self):
        from datetime import UTC, datetime, time

        from services.work import digest, tracking
        from services.work.models import WorkSettings

        WorkSettings.objects.filter(pk=prefs.settings_for(self.org).pk).update(
            working_days=[0, 1, 2, 3, 4, 5, 6]
        )
        org = Organisation.objects.get(pk=self.org.pk)
        now = datetime.combine(self.today, time(10, 0), tzinfo=UTC)
        with CaptureQueriesContext(connection) as queries:
            tracked = tracking.run(org, now=now)
            sent = digest.send_due(now)
            for reader in (self.csm, self.mona, self.admin, self.lee):
                digest.contents(User.objects.get(pk=reader.pk), today=self.today)
        self.assertGreaterEqual(tracked.nudged, 1)
        self.assertGreaterEqual(sent.sent, 1)
        offenders = [q["sql"] for q in queries if "DISTINCT" in q["sql"].upper()]
        self.assertEqual(offenders, [])
