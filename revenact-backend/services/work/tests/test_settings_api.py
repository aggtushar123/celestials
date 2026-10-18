"""Settings › Work (spec §2.3 Settings): any member reads them; only
manage_org_settings changes them, inside the limits; "Run now" runs the
recommender for the workspace."""

from datetime import timedelta

from core.models import AuditEvent
from services.customers.models import Customer
from services.notifications.models import Notification
from services.work.models import DEFAULT_SOURCES, Recommendation
from services.work.prefs import effective_sources, settings_for
from services.work.tests.recommend_fixtures import RecommendFixture

URL = "/api/v1/work/settings/"
RUN_NOW = "/api/v1/work/recommendations/refresh/"
WHOLE = "Choose a whole number from 1 to 120."


class WorkSettingsApiTests(RecommendFixture):
    def test_any_member_reads_them_and_whether_they_may_change_them(self):
        self.assertEqual(
            self.ok(self.csm, URL),
            {
                "recommend_to": "manager",
                "sources": DEFAULT_SOURCES,
                "dismiss_cooldown_days": 14,
                "timezone": "UTC",
                "working_days": [0, 1, 2, 3, 4],
                "escalate_after_days": 2,
                "digest_enabled": True,
                "digest_hour": 8,
                "email_ready": True,
                "can_edit": False,
            },
        )
        self.assertTrue(self.ok(self.admin, URL)["can_edit"])

    def test_an_admin_changes_some_and_keeps_the_rest(self):
        response = self.patch(
            self.admin,
            URL,
            {
                "recommend_to": "owner",
                "sources": {
                    "renewal_due": {"days": 45},
                    "health_drop": {"enabled": False, "drop": 1.5},
                },
                "dismiss_cooldown_days": 0,
                "can_edit": False,
                "colour": "blue",
            },
        )
        self.assertEqual(response.status_code, 200, response.data)
        sources = response.data["sources"]
        self.assertEqual(sources["renewal_due"], {"enabled": True, "days": 45})
        self.assertEqual(sources["health_drop"], {"enabled": False, "drop": 1.5, "window_days": 14})
        self.assertEqual(sources["anomaly"], {"enabled": True})
        self.assertEqual(
            (response.data["recommend_to"], response.data["dismiss_cooldown_days"]), ("owner", 0)
        )
        stored = settings_for(self.org)
        self.assertEqual((stored.recommend_to, stored.updated_by), ("owner", self.admin))
        event = AuditEvent.objects.get(action="work.settings_update")
        self.assertEqual(
            event.metadata, {"fields": ["dismiss_cooldown_days", "recommend_to", "sources"]}
        )

    def test_the_edges_are_allowed_and_drop_keeps_one_decimal(self):
        response = self.patch(
            self.admin,
            URL,
            {
                "sources": {
                    "renewal_due": {"days": 120},
                    "urgent_tickets": {"min": 50},
                    "health_drop": {"drop": 0.1, "window_days": 120},
                },
                "dismiss_cooldown_days": 120,
            },
        )
        self.assertEqual(response.status_code, 200, response.data)
        response = self.patch(self.admin, URL, {"sources": {"renewal_due": {"days": 1}}})
        self.assertEqual(response.status_code, 200, response.data)
        response = self.patch(self.admin, URL, {"sources": {"health_drop": {"drop": 4.96}}})
        self.assertEqual(response.data["sources"]["health_drop"]["drop"], 5.0)

    def test_a_member_may_not_change_them(self):
        response = self.patch(self.csm, URL, {"recommend_to": "owner"})
        self.assertEqual(
            (response.status_code, response.data),
            (403, {"detail": "You don't have permission to change organisation settings."}),
        )
        self.assertEqual(settings_for(self.org).recommend_to, "manager")

    def test_nothing_changed_writes_nothing(self):
        response = self.patch(self.admin, URL, {})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(AuditEvent.objects.filter(action="work.settings_update").exists())

    def test_sending_the_current_values_back_writes_nothing(self):
        before = settings_for(self.org)
        response = self.patch(
            self.admin,
            URL,
            {
                "recommend_to": "manager",
                "dismiss_cooldown_days": 14,
                "sources": {"renewal_due": {"enabled": True, "days": 30}},
            },
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(AuditEvent.objects.filter(action="work.settings_update").exists())
        after = settings_for(self.org)
        self.assertEqual(
            (after.updated_at, after.updated_by), (before.updated_at, before.updated_by)
        )

    def test_the_values_are_checked_and_nothing_is_saved(self):
        cases = [
            ({"recommend_to": "boss"}, {"recommend_to": ["Choose manager or owner."]}),
            (
                {"dismiss_cooldown_days": 121},
                {"dismiss_cooldown_days": ["Choose a whole number from 0 to 120."]},
            ),
            (
                {"dismiss_cooldown_days": -1},
                {"dismiss_cooldown_days": ["Choose a whole number from 0 to 120."]},
            ),
            (
                {"sources": {"renewal_due": {"days": 0}}},
                {"sources": {"renewal_due": {"days": [WHOLE]}}},
            ),
            (
                {"sources": {"renewal_due": {"days": 121}}},
                {"sources": {"renewal_due": {"days": [WHOLE]}}},
            ),
            (
                {"sources": {"renewal_due": {"days": 30.5}}},
                {"sources": {"renewal_due": {"days": [WHOLE]}}},
            ),
            (
                {"sources": {"renewal_due": {"days": True}}},
                {"sources": {"renewal_due": {"days": [WHOLE]}}},
            ),
            (
                {"sources": {"health_drop": {"window_days": 0}}},
                {"sources": {"health_drop": {"window_days": [WHOLE]}}},
            ),
            (
                {"sources": {"health_drop": {"drop": 0.05}}},
                {"sources": {"health_drop": {"drop": ["Choose a number from 0.1 to 5."]}}},
            ),
            (
                {"sources": {"health_drop": {"drop": 5.1}}},
                {"sources": {"health_drop": {"drop": ["Choose a number from 0.1 to 5."]}}},
            ),
            (
                {"sources": {"urgent_tickets": {"min": 51}}},
                {"sources": {"urgent_tickets": {"min": ["Choose a whole number from 1 to 50."]}}},
            ),
            (
                {"sources": {"anomaly": {"enabled": "yes"}}},
                {"sources": {"anomaly": {"enabled": ["Choose on or off."]}}},
            ),
            (
                {"sources": {"anomaly": {"days": 3}}},
                {"sources": {"anomaly": {"days": ["Unknown setting."]}}},
            ),
            ({"sources": {"weather": {}}}, {"sources": {"weather": ["Unknown source."]}}),
            ({"sources": []}, {"sources": ["Send the sources as one object."]}),
            ({"sources": {"agent": True}}, {"sources": {"agent": ["Unknown source."]}}),
            (
                {"sources": {"anomaly": True}},
                {"sources": {"anomaly": ["Send each source's settings as one object."]}},
            ),
            (
                {"recommend_to": "owner", "sources": {"renewal_due": {"days": 0}}},
                {"sources": {"renewal_due": {"days": [WHOLE]}}},
            ),
            ([1, 2], {"non_field_errors": ["Send the fields as one object."]}),
        ]
        for body, errors in cases:
            with self.subTest(body=body):
                response = self.patch(self.admin, URL, body)
                self.assertEqual((response.status_code, response.data), (400, errors))
        stored = settings_for(self.org)
        self.assertEqual((stored.recommend_to, stored.dismiss_cooldown_days), ("manager", 14))
        self.assertEqual(effective_sources(stored), DEFAULT_SOURCES)

    def test_admin_sets_the_tracking_and_digest_fields(self):
        body = {
            "timezone": "Asia/Kolkata",
            "working_days": [4, 0, 0, 6],
            "escalate_after_days": 5,
            "digest_enabled": False,
            "digest_hour": 0,
        }
        response = self.patch(self.admin, URL, body)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["timezone"], "Asia/Kolkata")
        self.assertEqual(response.data["working_days"], [0, 4, 6])
        self.assertEqual(
            (response.data["escalate_after_days"], response.data["digest_hour"]), (5, 0)
        )
        self.assertFalse(response.data["digest_enabled"])
        event = AuditEvent.objects.filter(action="work.settings_update").latest("id")
        self.assertEqual(
            event.metadata["fields"],
            ["digest_enabled", "digest_hour", "escalate_after_days", "timezone", "working_days"],
        )

    def test_utc_is_always_accepted(self):
        self.prefer(timezone="Asia/Kolkata")
        response = self.patch(self.admin, URL, {"timezone": "UTC"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["timezone"], "UTC")

    def test_every_bad_tracking_value_is_refused_at_once(self):
        response = self.patch(
            self.admin,
            URL,
            {
                "timezone": "Mars/Olympus",
                "working_days": [],
                "escalate_after_days": 0,
                "digest_enabled": "yes",
                "digest_hour": 24,
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data,
            {
                "timezone": ["Choose a timezone from the list."],
                "working_days": ["Choose at least one working day."],
                "escalate_after_days": ["Choose a whole number from 1 to 30."],
                "digest_enabled": ["Choose on or off."],
                "digest_hour": ["Choose a whole number from 0 to 23."],
            },
        )
        self.assertEqual(settings_for(self.org).timezone, "UTC")

    def test_working_days_must_be_weekday_numbers(self):
        for bad in ([7], [0, "1"], [True], "0,1", [0.5]):
            with self.subTest(bad=bad):
                response = self.patch(self.admin, URL, {"working_days": bad})
                self.assertEqual(response.status_code, 400)
                self.assertEqual(
                    response.data, {"working_days": ["Choose at least one working day."]}
                )

    def test_the_same_values_are_not_a_change(self):
        self.patch(self.admin, URL, {"timezone": "UTC", "working_days": [4, 3, 2, 1, 0]})
        self.assertFalse(AuditEvent.objects.filter(action="work.settings_update").exists())

    def test_a_member_cannot_change_the_tracking_fields(self):
        response = self.patch(self.csm, URL, {"digest_enabled": False})
        self.assertEqual(response.status_code, 403)
        self.assertTrue(settings_for(self.org).digest_enabled)

    def test_email_ready_follows_the_mail_backend(self):
        from django.test import override_settings

        with override_settings(EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend"):
            self.assertFalse(self.ok(self.csm, URL)["email_ready"])
        with override_settings(EMAIL_BACKEND="django.core.mail.backends.dummy.EmailBackend"):
            self.assertFalse(self.ok(self.csm, URL)["email_ready"])
        with override_settings(EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend"):
            self.assertTrue(self.ok(self.csm, URL)["email_ready"])

    def test_email_ready_and_can_edit_are_ignored_when_sent(self):
        response = self.patch(self.admin, URL, {"email_ready": False, "can_edit": False})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["can_edit"])


class RunNowTests(RecommendFixture):
    def test_an_admin_runs_the_recommender_now(self):
        self.only("renewal_due")
        response = self.post(self.admin, RUN_NOW)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            response.data,
            {"created": 2, "updated": 0, "expired": 0, "unrouted": 0, "notified": 2, "failed": []},
        )
        self.assertEqual(self.recs(status="open").count(), 2)
        event = AuditEvent.objects.get(action="work.recommendations_refresh")
        self.assertEqual(event.metadata, {"created": 2, "expired": 0, "failed": []})

    def test_a_member_may_not(self):
        response = self.post(self.csm, RUN_NOW)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Recommendation.objects.exists())

    def test_the_admin_who_runs_it_is_never_told(self):
        # Loose Ltd has no owner, so it falls back to the only view_all_accounts
        # member in the workspace: Alice, the admin who is about to click Run now.
        self.only("renewal_due")
        Customer.objects.filter(pk=self.loose.pk).update(
            renewal_date=self.today + timedelta(days=5)
        )
        response = self.post(self.admin, RUN_NOW)
        self.assertEqual(response.status_code, 200, response.data)
        loose_rec = self.recs(customer=self.loose).get()
        self.assertEqual(loose_rec.recipient, self.admin)
        self.assertFalse(
            Notification.objects.filter(
                recipient=self.admin, kind="recommendations_waiting"
            ).exists()
        )
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.mona, kind="recommendations_waiting"
            ).exists()
        )

    def test_a_second_run_with_nothing_changed_updates_nothing(self):
        self.only("renewal_due")
        first = self.post(self.admin, RUN_NOW)
        self.assertEqual(first.data["created"], 2)
        second = self.post(self.admin, RUN_NOW)
        self.assertEqual(
            (second.status_code, second.data),
            (
                200,
                {
                    "created": 0,
                    "updated": 0,
                    "expired": 0,
                    "unrouted": 0,
                    "notified": 0,
                    "failed": [],
                },
            ),
        )
