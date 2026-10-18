"""One open recommendation per kind and record (the AI agent's: one per
proposal instead), and a workspace's Work settings, made the first time
anyone asks with the spec's defaults (§2.1)."""

from django.db import IntegrityError, transaction

from services.notifications.models import Notification
from services.work.models import DEFAULT_SOURCES, WorkSettings
from services.work.prefs import effective_sources, settings_for
from services.work.tests.recommend_fixtures import RecommendFixture, task_proposal


class RecommendationModelTests(RecommendFixture):
    def test_one_open_per_organisation_and_kind(self):
        self.make_rec(on=self.dough, recipient=self.mona)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_rec(on=self.dough, recipient=self.mona)
        self.make_rec("health_drop", on=self.dough, recipient=self.mona)
        self.make_rec(on=self.dough, recipient=self.mona, status="dismissed")
        self.make_rec(on=self.dough, recipient=self.mona, status="expired")

    def test_one_open_per_account_beside_its_organisations(self):
        self.make_rec(on=self.taco, recipient=self.other)
        self.make_rec(on=self.west, recipient=self.other)
        self.make_rec(on=self.east, recipient=self.mona)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_rec(on=self.west, recipient=self.other)

    def test_the_agents_are_one_per_proposal_not_one_per_record(self):
        first = task_proposal(self.org, self.dough)
        second = task_proposal(self.org, self.dough, title="Send the renewal quote")
        self.make_rec("agent_action", on=self.dough, recipient=self.mona, agent_action=first)
        self.make_rec("agent_action", on=self.dough, recipient=self.mona, agent_action=second)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_rec("agent_action", on=self.dough, recipient=self.mona, agent_action=first)

    def test_a_proposal_may_have_expired_rows_beside_its_open_one(self):
        proposal = task_proposal(self.org, self.dough)
        self.make_rec(
            "agent_action",
            on=self.dough,
            recipient=self.mona,
            agent_action=proposal,
            status="expired",
        )
        self.make_rec(
            "agent_action",
            on=self.dough,
            recipient=self.mona,
            agent_action=proposal,
            status="expired",
        )
        self.make_rec("agent_action", on=self.dough, recipient=self.mona, agent_action=proposal)

    def test_its_record_is_the_account_when_there_is_one(self):
        self.assertEqual(self.make_rec(on=self.west, recipient=self.other).record, self.west)
        self.assertEqual(self.make_rec(on=self.dough, recipient=self.mona).record, self.dough)

    def test_recommendations_waiting_is_a_notification_kind(self):
        self.assertEqual(Notification.Kind.RECOMMENDATIONS_WAITING, "recommendations_waiting")


class WorkSettingsTests(RecommendFixture):
    def test_made_once_with_the_spec_defaults(self):
        WorkSettings.objects.filter(organisation=self.org).delete()
        prefs = settings_for(self.org)
        self.assertEqual(settings_for(self.org).pk, prefs.pk)
        self.assertEqual((prefs.recommend_to, prefs.dismiss_cooldown_days), ("manager", 14))
        self.assertEqual(effective_sources(prefs), DEFAULT_SOURCES)
        self.assertEqual(
            DEFAULT_SOURCES,
            {
                "renewal_due": {"enabled": True, "days": 30},
                "health_drop": {"enabled": True, "drop": 0.5, "window_days": 14},
                "urgent_tickets": {"enabled": True, "min": 1},
                "anomaly": {"enabled": True},
            },
        )
        self.assertEqual(WorkSettings.objects.filter(organisation=self.org).count(), 1)

    def test_a_missing_source_or_field_reads_as_its_default(self):
        WorkSettings.objects.filter(pk=settings_for(self.org).pk).update(
            sources={"renewal_due": {"days": 45}, "bogus": {}, "anomaly": "on"}
        )
        merged = effective_sources(WorkSettings.objects.get(organisation=self.org))
        self.assertEqual(merged["renewal_due"], {"enabled": True, "days": 45})
        self.assertEqual(merged["health_drop"], DEFAULT_SOURCES["health_drop"])
        self.assertEqual(merged["anomaly"], {"enabled": True})
        self.assertNotIn("bogus", merged)

    def test_a_workspaces_stored_defaults_are_its_own_copy(self):
        prefs = settings_for(self.org)
        prefs.sources["renewal_due"]["days"] = 99
        self.assertEqual(DEFAULT_SOURCES["renewal_due"]["days"], 30)
