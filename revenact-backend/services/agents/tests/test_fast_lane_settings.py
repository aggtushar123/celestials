"""Round 2 D3 contract §5.1, §5.2, R2D3-13, R2D3-18, R2D3-19: the fast lane's
settings: off by default, admins only, every refusal at once, audited with
old and new values, and today's use read from fast-lane model calls."""

from datetime import timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from core.models import AuditEvent
from services.agents.tests.intake_fixtures import IntakeFixture
from services.agents.tests.test_intake_queries import no_distinct
from services.copilot.models import ModelCall

URL = "/api/v1/agents/settings/"
#: Measured on this branch (Task 13): Alice reading Settings; raise only with a reason.
SETTINGS_QUERIES = 25


class FastLaneSettingsTests(IntakeFixture):
    def lane(self, user=None):
        return self.client_for(user or self.admin).get(URL).json()["signals"]["fast_lane"]

    def patch(self, body, user=None):
        return self.client_for(user or self.admin).patch(URL, {"fast_lane": body}, format="json")

    def test_off_by_default_with_the_limits(self):
        lane = self.lane(self.csm)
        self.assertEqual(
            {k: lane[k] for k in ("on", "rules", "per_hour", "per_day", "used_hour", "used_day")},
            {
                "on": False,
                "rules": {
                    "jira_priority": True,
                    "slack_connectors": [],
                    "senders": [],
                    "words": [],
                    "poor_health": False,
                },
                "per_hour": 10,
                "per_day": 50,
                "used_hour": 0,
                "used_day": 0,
            },
        )
        self.assertEqual(
            lane["limits"], {"per_hour": 10, "per_day": 50, "senders": 50, "words": 20}
        )

    def test_an_admin_switches_it_on_with_words_and_it_is_audited(self):
        response = self.patch({"on": True, "rules": {"words": [" Outage ", "outage", "data loss"]}})
        self.assertEqual(response.status_code, 200, response.json())
        lane = response.json()["signals"]["fast_lane"]
        self.assertEqual((lane["on"], lane["rules"]["words"]), (True, ["outage", "data loss"]))
        changes = AuditEvent.objects.get(action="agents.settings_update").metadata["changes"]
        self.assertIn("ai_fast_lane", changes["organisation"])
        self.assertFalse(changes["organisation"]["ai_fast_lane"]["old"]["on"])
        self.assertEqual(changes["organisation"]["ai_fast_lane"]["old"]["per_day"], 50)

    def test_senders_are_lower_cased_and_slack_connectors_are_kept(self):
        slack = self.connector("slack", "cs")
        response = self.patch(
            {"rules": {"senders": ["Boss@Acme.io", "@Acme.io"], "slack_connectors": [slack.pk]}}
        )
        self.assertEqual(response.status_code, 200, response.json())
        rules = response.json()["signals"]["fast_lane"]["rules"]
        self.assertEqual(rules["senders"], ["boss@acme.io", "@acme.io"])
        self.assertEqual(rules["slack_connectors"], [slack.pk])

    def test_a_sender_over_254_characters_is_refused(self):
        long_domain = "@" + "a." * 130 + "io"  # 263 characters, a valid @domain shape
        response = self.patch({"rules": {"senders": [long_domain]}})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["fast_lane"],
            {"rules": {"senders": ["Use an email address or @domain for each sender."]}},
        )

    def test_a_member_may_not_change_it(self):
        self.assertEqual(self.patch({"on": True}, user=self.csm).status_code, 403)

    def test_every_refusal_at_once(self):
        slack = self.connector("slack", "cs")
        response = self.patch(
            {
                "on": "yes",
                "rules": {
                    "words": ["x"],
                    "senders": ["not an address"],
                    "slack_connectors": [slack.pk, 999999],
                    "colour": "red",
                },
                "per_hour": 11,
                "per_day": 51,
            }
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["fast_lane"],
            {
                "on": ["Choose on or off."],
                "rules": {
                    "words": ["Use 2 to 40 characters for each word."],
                    "senders": ["Use an email address or @domain for each sender."],
                    "slack_connectors": ["Choose Slack connections from the list."],
                    "colour": ["Unknown setting."],
                },
                "per_hour": ["Choose a whole number from 0 to 10."],
                "per_day": ["Choose a whole number from 0 to 50."],
            },
        )

    def test_the_hourly_limit_may_not_pass_the_daily(self):
        self.assertEqual(self.patch({"per_hour": 2, "per_day": 5}).status_code, 200)
        self.assertEqual(
            self.patch({"per_hour": 6}).json()["fast_lane"],
            {"per_hour": ["The hourly limit can't be more than the daily limit."]},
        )

    def test_use_counts_only_ok_fast_lane_agent_calls(self):
        now = timezone.now()
        rows = [
            ("agent_cs", "fast_lane", "ok", now - timedelta(minutes=10)),
            ("agent_cs", "fast_lane", "ok", now - timedelta(hours=3)),
            ("agent_cs", "fast_lane", "failed", now - timedelta(minutes=5)),
            ("agent_cs", "", "ok", now - timedelta(minutes=5)),
            ("copilot", "fast_lane", "ok", now - timedelta(minutes=5)),
        ]
        for purpose, scope, outcome, at in rows:
            call = ModelCall.objects.create(
                organisation=self.org, purpose=purpose, scope_key=scope, outcome=outcome
            )
            ModelCall.objects.filter(pk=call.pk).update(created_at=at)
        lane = self.lane()
        self.assertEqual((lane["used_hour"], lane["used_day"]), (1, 2))


class SettingsQueryTests(IntakeFixture):
    def read(self):
        client = self.client_for(self.admin)
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(client.get(URL).status_code, 200)
        no_distinct(self, queries)
        return len(queries)

    def test_the_settings_read_costs_the_same_whatever_slack_connectors_exist(self):
        self.connector("slack", "cs")
        self.read()  # warm
        few = self.read()
        for _ in range(4):
            self.connector("slack", "cs")
        many = self.read()
        lane = self.client_for(self.admin).get(URL).json()["signals"]["fast_lane"]
        self.assertEqual(len(lane["slack_choices"]), 5)
        self.assertEqual(few, many)
        self.assertEqual(many, SETTINGS_QUERIES)
