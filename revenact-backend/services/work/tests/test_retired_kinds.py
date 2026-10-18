"""Retired recommendation kinds (delivery 2 contract §2): never produced,
closed by the migration as dismissed/retired, not a reason anyone may
choose, and gone from the settings API."""

from importlib import import_module

from django.apps import apps

from services.work import sources
from services.work.models import LIVE_KINDS, RETIRED_KINDS, Recommendation, WorkSettings
from services.work.prefs import settings_for
from services.work.recommend import refresh
from services.work.tests.feed_fixtures import FeedFixture

SETTINGS = "/api/v1/work/settings/"


class RetiredKindsTests(FeedFixture):
    def test_only_the_live_kinds_have_a_source(self):
        self.assertEqual(tuple(sources.SOURCES), LIVE_KINDS)
        self.assertFalse(set(RETIRED_KINDS) & set(sources.SOURCES))

    def test_a_refresh_makes_none_of_the_retired_kinds(self):
        self.due(self.csm, self.pizza, due_in=-10)
        self.question(self.csm, customer=self.pizza)
        self.proposal(self.pizza)
        result = refresh(self.org, today=self.today)
        self.assertEqual(result.failed, [])
        self.assertFalse(Recommendation.objects.filter(kind__in=RETIRED_KINDS).exists())

    def test_the_migration_closes_open_retired_ones_and_keeps_the_rest(self):
        open_retired = [
            self.suggestion(self.csm, self.pizza, kind=kind)
            for kind in ("overdue_tasks", "open_questions")
        ]
        agent = self.suggestion(self.csm, self.taco, kind="agent_action")
        Recommendation.objects.filter(pk=agent.pk).update(agent_action=self.proposal(self.taco))
        open_retired.append(agent)
        live = self.suggestion(self.csm, self.dough)
        assigned = self.suggestion(self.mona, self.soup, kind="overdue_tasks")
        Recommendation.objects.filter(pk=assigned.pk).update(status="assigned")
        migration = import_module("services.work.migrations.0006_retire_recommendation_kinds")
        migration.close_retired(apps, None)
        for rec in open_retired:
            rec.refresh_from_db()
            self.assertEqual(
                (rec.status, rec.dismiss_reason, rec.decided_by_id), ("dismissed", "retired", None)
            )
            self.assertIsNotNone(rec.decided_at)
        live.refresh_from_db()
        assigned.refresh_from_db()
        self.assertEqual((live.status, assigned.status), ("open", "assigned"))

    def test_deciding_a_retired_one_is_already_decided(self):
        rec = self.suggestion(self.csm, self.pizza, kind="overdue_tasks")
        Recommendation.objects.filter(pk=rec.pk).update(
            status="dismissed", dismiss_reason="retired"
        )
        response = self.as_user(self.csm).post(
            f"/api/v1/work/recommendations/{rec.pk}/dismiss/",
            {"reason": "not_relevant"},
            format="json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "This recommendation was already dismissed.")
        self.assertEqual(response.json()["recommendation"]["dismiss_reason"], "retired")

    def test_nobody_may_choose_retired_as_a_reason(self):
        rec = self.suggestion(self.csm, self.pizza)
        response = self.as_user(self.csm).post(
            f"/api/v1/work/recommendations/{rec.pk}/dismiss/", {"reason": "retired"}, format="json"
        )
        self.assertEqual(
            (response.status_code, response.json()),
            (400, {"reason": ["Choose already handled, not relevant, wrong person or other."]}),
        )

    def test_the_settings_api_lists_the_live_sources_only(self):
        body = self.as_user(self.admin).get(SETTINGS).json()
        self.assertEqual(sorted(body["sources"]), sorted(LIVE_KINDS))
        for kind in ("overdue_tasks", "open_questions", "agent"):
            response = self.as_user(self.admin).patch(
                SETTINGS, {"sources": {kind: {"enabled": False}}}, format="json"
            )
            self.assertEqual(
                (response.status_code, response.json()),
                (400, {"sources": {kind: ["Unknown source."]}}),
                kind,
            )

    def test_a_stored_value_for_a_retired_switch_is_left_out(self):
        WorkSettings.objects.filter(pk=settings_for(self.org).pk).update(
            sources={
                "agent": {"enabled": False},
                "overdue_tasks": {"enabled": False, "days": 9},
                "open_questions": {"days": 9},
                "renewal_due": {"days": 45},
            }
        )
        sources = self.as_user(self.admin).get(SETTINGS).json()["sources"]
        self.assertEqual(sorted(sources), sorted(LIVE_KINDS))
        self.assertEqual(sources["renewal_due"], {"enabled": True, "days": 45})

    def test_running_an_agent_no_longer_refreshes_recommendations(self):
        import inspect

        from services.agents import views as agent_views

        # Run now itself calls a model, so the check reads the view's code.
        self.assertNotIn("recommend", inspect.getsource(agent_views.AgentRunView))
