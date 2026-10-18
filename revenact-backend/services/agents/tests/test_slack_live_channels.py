"""The live Slack channel list (agent bundles round 2 D2 contract §4.1,
R2D2-15 to R2D2-17). Slack is a fake; the cache is LocMem."""

from django.core.cache import cache
from django.db import connection
from django.test import SimpleTestCase
from django.test.utils import CaptureQueriesContext

from services.agents.outside import slack_channels
from services.agents.tests.outside_fixtures import OutsideFixture
from services.agents.tests.test_intake_queries import no_distinct
from services.connectors.tests.slack_fake import use_slack

OPTIONS = "/api/v1/agents/bundles/{}/steps/{}/options/slack_channels/"
#: The live list, warm or cold cache (contract §8), measured: D3 adds the one
#: SlackChannel read for the included channels (4 before D3).
SLACK_OPTIONS_QUERIES = 5


class LiveChannelTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.api = use_slack(self)
        self.api.names.update({"C0RANDOM": "random", "G0LEADS": "leads"})
        self.api.channels.update({"C0RANDOM": [], "G0LEADS": []})
        self.api.members |= {"C0RANDOM", "G0LEADS"}
        self.api.private.add("G0LEADS")
        self.api.scopes = [*self.api.scopes, "chat:write"]
        self.support = self.slack_connector()
        self.support.granted_scopes = ["channels:read", "groups:read", "chat:write"]
        self.support.save()
        self.conversation, self.thread = self.slack_thread(self.pizza, self.support)
        self.bundle = self.outside_bundle(
            self.thread, ("slack.reply", self.slack_payload(self.conversation, self.support))
        )
        self.step = self.bundle.steps.get()

    def get(self, user, **query):
        return self.client_for(user).get(OPTIONS.format(self.bundle.pk, self.step.pk), query)

    def test_without_live_the_answer_is_todays(self):
        self.assertEqual(
            self.get(self.csm).json(),
            {
                "options": [
                    {"id": str(self.support.pk), "name": "#support", "detail": "This thread"}
                ],
                "more": False,
            },
        )

    def test_live_adds_member_channels_nobody_syncs(self):
        body = self.get(self.csm, live="1").json()
        pk = self.support.pk
        self.assertEqual(
            body,
            {
                "options": [
                    {"id": str(pk), "name": "#support", "detail": "This thread"},
                    {"id": f"{pk}:C0ESCALATE", "name": "#escalations", "detail": "Not synced"},
                    {"id": f"{pk}:C0RANDOM", "name": "#random", "detail": "Not synced"},
                ],
                "more": False,
                "note": None,
            },
        )

    def test_private_unsynced_channels_are_for_admins_only(self):
        ids = [o["id"] for o in self.get(self.admin, live="1").json()["options"]]
        self.assertIn(f"{self.support.pk}:G0LEADS", ids)
        rows = self.get(self.admin, live="1").json()["options"]
        self.assertIn(
            {"id": f"{self.support.pk}:G0LEADS", "name": "#leads", "detail": "Not synced, private"},
            rows,
        )

    def test_no_groups_read_means_public_only(self):
        self.support.granted_scopes = ["channels:read", "chat:write"]
        self.support.save()
        self.get(self.admin, live="1")
        [query] = [q for name, _, q in self.api.calls if name == "users.conversations"]
        self.assertEqual(query["types"], "public_channel")

    def test_query_filters_and_caps(self):
        body = self.get(self.csm, live="1", query="ESC").json()
        self.assertEqual([o["name"] for o in body["options"]], ["#escalations"])
        for n in range(150):
            self.api.names[f"C{n:04d}"] = f"room-{n:03d}"
            self.api.channels[f"C{n:04d}"] = []
            self.api.members.add(f"C{n:04d}")
        cache.clear()
        body = self.get(self.csm, live="1", query="room").json()
        self.assertEqual((len(body["options"]), body["more"]), (100, True))

    def test_the_list_is_cached_for_five_minutes(self):
        self.get(self.csm, live="1")
        self.get(self.csm, live="1")
        self.assertEqual(len([n for n, _, _ in self.api.calls if n == "users.conversations"]), 1)

    def test_a_failed_live_read_keeps_the_synced_rows(self):
        self.api.refuse_next("users.conversations", "ratelimited")
        body = self.get(self.csm, live="1").json()
        self.assertEqual([o["name"] for o in body["options"]], ["#support"])
        self.assertEqual(
            body["note"], "Slack didn't list its other channels. Try again in a minute."
        )
        cache.clear()
        self.api.refuse_next("users.conversations", "missing_scope")
        self.assertEqual(
            self.get(self.csm, live="1").json()["note"],
            "Add channels:read to the Slack app to choose other channels.",
        )

    def test_a_synced_channel_the_reader_cannot_read_never_appears(self):
        self.slack_connector(department="engineering", channel="C0RANDOM", name="random")
        names = [o["name"] for o in self.get(self.csm, live="1").json()["options"]]
        self.assertNotIn("#random", names)

    def test_queries_do_not_grow_with_channels(self):
        client = self.client_for(self.csm)
        url = OPTIONS.format(self.bundle.pk, self.step.pk)
        client.get(url, {"live": "1"})
        with CaptureQueriesContext(connection) as queries:
            client.get(url, {"live": "1"})
        no_distinct(self, queries)
        self.assertEqual(len(queries), SLACK_OPTIONS_QUERIES)
        cache.clear()
        with CaptureQueriesContext(connection) as cold:
            client.get(url, {"live": "1"})
        self.assertEqual(len(cold), SLACK_OPTIONS_QUERIES)

    def test_a_long_search_is_refused(self):
        response = self.get(self.csm, live="1", query="x" * 101)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"query": ["Keep the search under 100 characters."]})

    def test_the_cache_holds_names_only(self):
        self.get(self.csm, live="1")
        held = cache.get(slack_channels.CACHE.format(self.support.pk))
        self.assertEqual({tuple(sorted(row)) for row in held}, {("id", "name", "private")})

    def test_a_private_unsynced_channel_is_not_for_a_csm(self):
        names = [o["name"] for o in self.get(self.csm, live="1").json()["options"]]
        self.assertNotIn("#leads", names)

    def legacy(self, **kwargs):
        """A Slack connector made before connectors stored their team id."""
        made = self.slack_connector(**kwargs)
        made.config.pop("team_id")
        made.save()
        return made

    def in_team(self, team, channel):
        made = self.slack_connector(channel=channel, name=channel.lower())
        made.config["team_id"] = team
        made.save()
        return made

    def test_a_channel_a_legacy_connector_syncs_is_never_unsynced(self):
        # Synced is the channel id alone: a connector without a team id still
        # holds its channel for its department (R2D2-15).
        self.legacy(department="engineering", channel="C0ESCALATE", name="escalations")
        for user in (self.csm, self.admin):
            with self.subTest(user=user.name):
                ids = [o["id"] for o in self.get(user, live="1").json()["options"]]
                self.assertNotIn(f"{self.support.pk}:C0ESCALATE", ids)

    def test_a_failed_live_read_is_not_cached(self):
        self.api.refuse_next("users.conversations", "ratelimited")
        self.get(self.csm, live="1")
        body = self.get(self.csm, live="1").json()
        self.assertEqual(len([n for n, _, _ in self.api.calls if n == "users.conversations"]), 2)
        self.assertIsNone(body["note"])
        self.assertIn("#escalations", [o["name"] for o in body["options"]])

    def test_one_read_per_slack_workspace(self):
        from unittest.mock import patch

        same = self.in_team("T0ACME", "C0SAME")
        beta = self.in_team("T0BETA", "C0BETA1")
        self.in_team("T0BETA", "C0BETA2")
        old = self.legacy(channel="C0OLD1")
        older = self.legacy(channel="C0OLD2")
        read, real = [], slack_channels.member_channels

        def spy(connector):
            read.append(connector.pk)
            return real(connector)

        with patch.object(slack_channels, "member_channels", spy):
            self.get(self.csm, live="1")
            # The source's workspace is read through the source; another
            # workspace through its lowest id; legacy connectors never merge.
            self.assertEqual(sorted(read), sorted([self.support.pk, beta.pk, old.pk, older.pk]))
            self.step.payload = {**self.step.payload, "source_connector_id": same.pk}
            self.step.save()
            read.clear()
            self.get(self.csm, live="1")
        self.assertIn(same.pk, read)
        self.assertNotIn(self.support.pk, read)

    def test_a_live_search_matches_the_name_not_the_hash(self):
        names = [o["name"] for o in self.get(self.csm, live="1", query="#").json()["options"]]
        self.assertEqual(names, ["#support"])


class ParseTests(SimpleTestCase):
    def test_choices(self):
        self.assertEqual(slack_channels.parse("6"), (6, ""))
        self.assertEqual(slack_channels.parse("6:c0esc"), (6, "C0ESC"))
        for bad in (6, None, "", "x", "6:", ":C0", "6:C0-1", "²", "6:C0:1"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                slack_channels.parse(bad)
