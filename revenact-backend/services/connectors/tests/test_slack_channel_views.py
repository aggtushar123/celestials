"""Slack escalations D3 contract §2.1, §3, §5, SC3-9, SC3-15 to SC3-17,
SC3-30: an admin reads a Slack connection's channels and includes, excludes
or sets one to a customer; every refusal in order; one audited change; the
connection says how many it syncs and when the last event arrived."""

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation, User
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors.models import Connector, SlackChannel
from services.customers.tests.slack_fixtures import conversation
from services.segments.tests.fixtures import person

LIST = "/api/v1/connectors/{}/slack-channels/"
ONE = "/api/v1/connectors/{}/slack-channels/{}/"
#: Contract §6, measured: the user, membership, role and organisation reads, the
#: connection, its channel rows, the conversation counts. The connector list is 5.
SLACK_CHANNELS_QUERIES = 7
CONNECTOR_LIST_QUERIES = 5


class ChannelViewTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.support = self.slack_connector(channel_row=False)
        self.support.granted_scopes = [*self.support.granted_scopes, "channels:join"]
        self.support.save(update_fields=["granted_scopes"])
        self.all = SlackChannel.objects.create(
            connector=self.support, channel_id="C0SUPPORT", name="support", is_member=True
        )
        self.random = SlackChannel.objects.create(
            connector=self.support, channel_id="C0RANDOM", name="random"
        )
        SlackChannel.objects.create(
            connector=self.support, channel_id="C0GONE", name="gone", is_archived=True
        )
        conversation(self.pizza, self.support, channel="C0SUPPORT")

    def admin_client(self):
        return self.client_for(self.admin)

    def test_the_list(self):
        body = self.admin_client().get(LIST.format(self.support.pk)).json()
        self.assertEqual(
            (body["can_join"], body["synced"], body["total"], body["events_at"]),
            (True, 2, 2, None),
        )
        self.assertEqual(
            body["channels"][0],
            {
                "id": "C0RANDOM",
                "name": "random",
                "included": True,
                "member": False,
                "shared": False,
                "private": False,
                "record": None,
                "conversations": 0,
                "join_error": "",
                "read_at": None,
                "chosen_by": None,
            },
        )
        self.assertEqual(body["channels"][1]["conversations"], 1)

    def test_refusals(self):
        self.assertEqual(
            self.client_for(self.csm).get(LIST.format(self.support.pk)).status_code, 403
        )
        board = self.jira_connector()
        answer = self.admin_client().get(LIST.format(board.pk))
        self.assertEqual((answer.status_code, answer.json()["code"]), (409, "NOT_SLACK"))
        client = self.admin_client()
        cases = [
            (
                ONE.format(self.support.pk, "C0GONE"),
                {"included": False},
                404,
                {"code": "NO_SUCH_CHANNEL", "detail": "No such channel."},
            ),
            (
                ONE.format(self.support.pk, "C0RANDOM"),
                {},
                400,
                {"detail": "Change whether it syncs, or its customer."},
            ),
            (
                ONE.format(self.support.pk, "C0RANDOM"),
                {"included": "no"},
                400,
                {"included": ["Choose on or off."]},
            ),
            (
                ONE.format(self.support.pk, "C0RANDOM"),
                {"record": {"type": "deal", "id": 1}},
                400,
                {"record": ["Choose an organisation or an account."]},
            ),
            (
                ONE.format(self.support.pk, "C0RANDOM"),
                {"record": {"type": "customer", "id": 999999}},
                400,
                {"record": ["No such organisation."]},
            ),
        ]
        for url, body, status, expected in cases:
            with self.subTest(body=body):
                answer = client.patch(url, body, format="json")
                self.assertEqual((answer.status_code, answer.json()), (status, expected))

    def test_a_record_the_connection_does_not_cover(self):
        self.support.customers.set([self.taco])
        answer = self.admin_client().patch(
            ONE.format(self.support.pk, "C0RANDOM"),
            {"record": {"type": "customer", "id": self.pizza.pk}},
            format="json",
        )
        self.assertEqual(
            answer.json(),
            {"record": [f"{self.pizza.name} isn't covered by this Slack connection."]},
        )

    def test_exclude_and_set_a_customer_audited_once_each(self):
        self.random.join_error = "removed"
        self.random.save(update_fields=["join_error"])
        client = self.admin_client()
        answer = client.patch(
            ONE.format(self.support.pk, "C0RANDOM"),
            {"included": False, "record": {"type": "customer", "id": self.pizza.pk}},
            format="json",
        )
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertEqual(
            (answer.json()["included"], answer.json()["record"], answer.json()["join_error"]),
            (False, {"type": "customer", "id": self.pizza.pk, "name": self.pizza.name}, ""),
        )
        self.random.refresh_from_db()
        self.assertEqual(
            (self.random.chosen_by_id, self.random.customer_id), (self.admin.pk, self.pizza.pk)
        )
        event = AuditEvent.objects.get(action="slack_channel.update")
        self.assertEqual(
            event.metadata,
            {
                "channel": self.random.pk,
                "changes": {
                    "included": {"old": True, "new": False},
                    "record": {"old": None, "new": f"customer:{self.pizza.pk}"},
                },
            },
        )
        client.patch(ONE.format(self.support.pk, "C0RANDOM"), {"included": False}, format="json")
        self.assertEqual(AuditEvent.objects.filter(action="slack_channel.update").count(), 1)

    def test_a_change_keeps_what_an_event_wrote_meanwhile(self):
        """F4: the PATCH saves only the fields it changes, so an event's
        `event_at` and a queued missed thread written meanwhile survive it."""
        from unittest.mock import patch

        from services.connectors import slack_channel_views

        stamp = timezone.now()
        real = slack_channel_views._record

        def meanwhile(*args, **kwargs):
            SlackChannel.objects.filter(pk=self.random.pk).update(
                event_at=stamp, missed=["1792041400.000100"], walk_before="1792041300.000100"
            )
            return real(*args, **kwargs)

        with patch.object(slack_channel_views, "_record", meanwhile):
            answer = self.admin_client().patch(
                ONE.format(self.support.pk, "C0RANDOM"),
                {"record": {"type": "customer", "id": self.pizza.pk}},
                format="json",
            )
        self.assertEqual(answer.status_code, 200, answer.content)
        self.random.refresh_from_db()
        self.assertEqual(self.random.customer_id, self.pizza.pk)
        self.assertEqual(
            (self.random.event_at, self.random.missed, self.random.walk_before),
            (stamp, ["1792041400.000100"], "1792041300.000100"),
        )

    def test_the_connection_counts_its_channels_and_its_last_event(self):
        body = self.admin_client().get(f"/api/v1/connectors/{self.support.pk}/").json()
        self.assertEqual(
            body["slack_channels"],
            {"synced": 2, "total": 2, "can_join": True, "events_at": None},
        )
        at = timezone.now()
        SlackChannel.objects.filter(pk=self.random.pk).update(event_at=at)
        body = self.admin_client().get(f"/api/v1/connectors/{self.support.pk}/").json()
        self.assertTrue(body["slack_channels"]["events_at"].startswith(at.strftime("%Y-%m-%dT")))
        listed = self.admin_client().get(LIST.format(self.support.pk)).json()
        self.assertEqual(listed["events_at"], body["slack_channels"]["events_at"])
        board = self.jira_connector()
        self.assertIsNone(
            self.admin_client().get(f"/api/v1/connectors/{board.pk}/").json()["slack_channels"]
        )

    def test_a_kept_private_channel_is_not_counted(self):
        SlackChannel.objects.create(
            connector=self.support, channel_id="G0KEPT", name="kept", is_private=True
        )
        body = self.admin_client().get(f"/api/v1/connectors/{self.support.pk}/").json()
        self.assertEqual(
            (body["slack_channels"]["synced"], body["slack_channels"]["total"]), (2, 2)
        )
        listed = self.admin_client().get(LIST.format(self.support.pk)).json()
        self.assertEqual((listed["synced"], listed["total"]), (2, 2))
        self.assertIn("G0KEPT", [row["id"] for row in listed["channels"]])

    def test_the_setup_help_waits_for_slacks_say(self):
        from services.connectors.providers.slack import SlackProvider

        self.assertEqual(
            SlackProvider.help,
            "Revenact reads every public channel and joins new ones itself once Slack allows "
            "it. Leave the token blank to sign in with Slack when it is set up on this "
            "deployment.",
        )

    def test_the_list_costs_the_same_for_three_or_eight_channels(self):
        def count():
            with CaptureQueriesContext(connection) as queries:
                self.admin_client().get(LIST.format(self.support.pk))
            return len(queries)

        few = count()
        for n in range(5):
            SlackChannel.objects.create(connector=self.support, channel_id=f"C0M{n}", name=f"m-{n}")
        self.assertEqual(count(), few)
        self.assertEqual(few, SLACK_CHANNELS_QUERIES)

    def test_another_workspace_and_a_member_without_the_right_are_refused(self):
        other = Organisation.objects.create(name="Other Inc", currency="USD")
        stranger = person("zed@other.io", "Zed", other, role=User.Role.ADMIN)
        foreign = Connector.objects.create(organisation=other, provider="slack", name="Slack")
        SlackChannel.objects.create(connector=foreign, channel_id="C0FOREIGN", name="x")
        # their connection, my admin: not found in either route
        client = self.admin_client()
        self.assertEqual(client.get(LIST.format(foreign.pk)).status_code, 404)
        self.assertEqual(
            client.patch(
                ONE.format(foreign.pk, "C0FOREIGN"), {"included": False}, format="json"
            ).status_code,
            404,
        )
        # my connection, their admin: not found too
        theirs = self.as_user(User.objects.get(pk=stranger.pk))
        self.assertEqual(theirs.get(LIST.format(self.support.pk)).status_code, 404)
        # a member without the right may not change a channel
        answer = self.client_for(self.csm).patch(
            ONE.format(self.support.pk, "C0RANDOM"), {"included": False}, format="json"
        )
        self.assertEqual(answer.status_code, 403)
        self.random.refresh_from_db()
        self.assertTrue(self.random.included)

    def test_the_connector_list_costs_the_same_for_one_or_four_channels(self):
        def count():
            with CaptureQueriesContext(connection) as queries:
                self.admin_client().get("/api/v1/connectors/")
            return len(queries)

        few = count()
        for n in range(3):
            SlackChannel.objects.create(connector=self.support, channel_id=f"C0N{n}", name=f"n-{n}")
        self.assertEqual(count(), few)
        self.assertEqual(few, CONNECTOR_LIST_QUERIES)
