"""Slack escalations D3, SC3-3 to SC3-6, SC3-26: each pass lists the
channels (new ones included, Slack Connect ones not; a bot someone removed
stays out), joins up to five with the scope, and the catch-up picks one
channel at most once a minute: a walk first, then never read, then the
longest since read. Missed threads queue per channel. Slack is a fake."""

from datetime import timedelta

from django.utils import timezone

from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors import slack_channels
from services.connectors.models import SlackChannel
from services.connectors.providers.slack import SlackProvider
from services.connectors.tests.slack_fake import use_slack

CREDS = {"bot_token": "xoxb-test-only"}


class ChannelRowsTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.slack_api = use_slack(self)
        self.support = self.slack_connector()
        self.provider = SlackProvider()
        self.now = timezone.now()

    def refresh(self):
        return slack_channels.refresh(self.support, self.provider, CREDS, now=self.now)

    def add_channel(self, channel, name, *, member=False, shared=False):
        self.slack_api.channels[channel] = []
        self.slack_api.names[channel] = name
        if member:
            self.slack_api.members.add(channel)
        if shared:
            self.slack_api.shared.add(channel)

    def test_new_channels_are_rows_and_shared_ones_start_excluded(self):
        self.add_channel("C0RANDOM", "random")
        self.add_channel("C0GLOBEX", "globex-shared", shared=True)
        rows = {r.channel_id: r for r in self.refresh()}
        self.assertEqual(set(rows), {"C0SUPPORT", "C0ESCALATE", "C0RANDOM", "C0GLOBEX"})
        self.assertEqual((rows["C0RANDOM"].included, rows["C0RANDOM"].is_member), (True, False))
        self.assertEqual(
            (rows["C0GLOBEX"].included, rows["C0GLOBEX"].external_shared), (False, True)
        )

    def test_a_row_follows_slack_and_one_slack_no_longer_lists_is_archived(self):
        self.refresh()
        self.slack_api.names["C0SUPPORT"] = "support-desk"
        del self.slack_api.channels["C0ESCALATE"]
        self.slack_api.members.discard("C0ESCALATE")
        self.refresh()
        self.assertEqual(SlackChannel.objects.get(channel_id="C0SUPPORT").name, "support-desk")
        self.assertTrue(SlackChannel.objects.get(channel_id="C0ESCALATE").is_archived)

    def test_a_channel_that_becomes_shared_is_excluded_unless_an_admin_chose_it(self):
        self.refresh()
        SlackChannel.objects.filter(channel_id="C0SUPPORT").update(
            chosen_at=self.now, chosen_by=self.admin
        )
        self.slack_api.shared.update({"C0SUPPORT", "C0ESCALATE"})
        self.refresh()
        self.assertTrue(SlackChannel.objects.get(channel_id="C0SUPPORT").included)
        self.assertFalse(SlackChannel.objects.get(channel_id="C0ESCALATE").included)

    def meanwhile(self, change):
        """Run `change` (an admin's PATCH, an event) while Slack is listing."""
        from unittest.mock import patch

        real = self.provider.list_channels

        def listing(*args, **kwargs):
            change()
            return real(*args, **kwargs)

        return patch.object(self.provider, "list_channels", listing)

    def test_an_admin_s_change_made_during_the_listing_is_kept(self):
        """F5: the pass never writes `included` back from what it read."""
        self.refresh()
        self.slack_api.names["C0SUPPORT"] = "support-desk"  # so the pass saves the row
        with self.meanwhile(
            lambda: SlackChannel.objects.filter(channel_id="C0SUPPORT").update(
                included=False, chosen_at=self.now, chosen_by=self.admin
            )
        ):
            self.refresh()
        row = SlackChannel.objects.get(channel_id="C0SUPPORT")
        self.assertEqual((row.name, row.included), ("support-desk", False))

    def test_a_channel_an_admin_chose_while_it_turned_shared_stays_included(self):
        """F5, SC3-4: only a row nobody chose is excluded when it turns shared."""
        self.refresh()
        self.slack_api.shared.update({"C0SUPPORT", "C0ESCALATE"})
        with self.meanwhile(
            lambda: SlackChannel.objects.filter(channel_id="C0SUPPORT").update(
                chosen_at=self.now, chosen_by=self.admin
            )
        ):
            rows = {row.channel_id: row for row in self.refresh()}
        self.assertTrue(SlackChannel.objects.get(channel_id="C0SUPPORT").included)
        self.assertFalse(SlackChannel.objects.get(channel_id="C0ESCALATE").included)
        self.assertFalse(rows["C0ESCALATE"].included)

    def test_a_row_an_event_made_during_the_listing_is_returned(self):
        """F6: an event's row for a new channel never fails the pass."""
        self.add_channel("C0RANDOM", "random")
        with self.meanwhile(
            lambda: SlackChannel.objects.create(
                connector=self.support, channel_id="C0RANDOM", is_member=True
            )
        ):
            rows = {row.channel_id: row for row in self.refresh()}
        self.assertEqual(set(rows), {"C0SUPPORT", "C0ESCALATE", "C0RANDOM"})
        self.assertTrue(all(row.pk for row in rows.values()))
        self.assertEqual(SlackChannel.objects.filter(channel_id="C0RANDOM").count(), 1)

    def test_a_bot_someone_removed_is_not_joined_again(self):
        self.support.granted_scopes = [*self.support.granted_scopes, "channels:join"]
        self.refresh()
        self.slack_api.members.discard("C0ESCALATE")
        rows = self.refresh()
        row = SlackChannel.objects.get(channel_id="C0ESCALATE")
        self.assertEqual((row.is_member, row.join_error), (False, slack_channels.REMOVED))
        self.assertEqual(slack_channels.join_missing(self.support, self.provider, CREDS, rows), 0)

    def test_a_bot_someone_adds_back_is_no_longer_marked_removed(self):
        self.refresh()
        self.slack_api.members.discard("C0ESCALATE")
        self.refresh()
        self.slack_api.members.add("C0ESCALATE")
        self.refresh()
        row = SlackChannel.objects.get(channel_id="C0ESCALATE")
        self.assertEqual((row.is_member, row.join_error), (True, ""))

    def test_a_failed_listing_keeps_the_rows(self):
        self.refresh()
        self.slack_api.refuse_next("conversations.list", "internal_error")
        self.assertEqual(len(self.refresh()), 2)

    def test_joining_needs_the_scope_and_stops_at_five(self):
        for n in range(7):
            self.add_channel(f"C0NEW{n}", f"new-{n}")
        rows = self.refresh()
        self.assertEqual(slack_channels.join_missing(self.support, self.provider, CREDS, rows), 0)
        self.support.granted_scopes = [*self.support.granted_scopes, "channels:join"]
        self.assertEqual(slack_channels.join_missing(self.support, self.provider, CREDS, rows), 5)
        self.assertEqual(SlackChannel.objects.filter(is_member=True).count(), 2 + 5)

    def test_a_refused_join_is_kept_and_not_tried_again(self):
        self.add_channel("C0ODD", "odd")
        self.slack_api.cant_join.add("C0ODD")
        self.support.granted_scopes = [*self.support.granted_scopes, "channels:join"]
        rows = self.refresh()
        slack_channels.join_missing(self.support, self.provider, CREDS, rows)
        row = SlackChannel.objects.get(channel_id="C0ODD")
        self.assertEqual(row.join_error, "method_not_supported_for_channel_type")
        calls = len(self.slack_api.calls)
        slack_channels.join_missing(self.support, self.provider, CREDS, self.refresh())
        self.assertNotIn("conversations.join", [c[0] for c in self.slack_api.calls[calls:]])

    def test_an_excluded_or_shared_channel_is_never_joined(self):
        self.add_channel("C0OFF", "off")
        self.add_channel("C0GLOBEX", "globex-shared", shared=True)
        rows = self.refresh()
        SlackChannel.objects.filter(channel_id="C0OFF").update(included=False)
        self.support.granted_scopes = [*self.support.granted_scopes, "channels:join"]
        slack_channels.join_missing(self.support, self.provider, CREDS, self.refresh())
        self.assertFalse(SlackChannel.objects.get(channel_id="C0OFF").is_member)
        self.assertFalse(SlackChannel.objects.get(channel_id="C0GLOBEX").is_member)
        self.assertEqual(len(rows), 4)

    def row(self, channel_id, **fields):
        return SlackChannel.objects.create(
            connector=self.support,
            channel_id=channel_id,
            name=channel_id.lower(),
            **{
                "is_member": True,
                **fields,
            },
        )

    def test_the_catch_up_picks_a_walk_then_never_read_then_the_longest_since_read(self):
        old = self.row("C0OLD", read_at=self.now - timedelta(hours=3))
        older = self.row("C0OLDER", read_at=self.now - timedelta(hours=5))
        never = self.row("C0NEVER")
        walking = self.row("C0WALK", read_at=self.now, walk_before="1792041400.000100")
        off = self.row("C0OFF", included=False)
        rows = [old, older, never, walking, off]
        self.assertEqual(slack_channels.pick(rows, self.now), walking)
        walking.walk_before = ""
        self.assertEqual(slack_channels.pick(rows, self.now), never)
        never.read_at = self.now
        self.assertEqual(slack_channels.pick(rows, self.now), older)
        self.assertIsNone(slack_channels.pick([off], self.now))

    def test_a_refused_channel_is_read_again_after_fifteen_minutes(self):
        """F1 (owner): a row whose read Slack refused goes last only for
        READ_RETRY after its last try; then it ranks as any other row."""
        healthy = self.row("C0HEALTHY", read_at=self.now - timedelta(days=3))
        failed = self.row(
            "C0FAILED", read_error="internal_error", asked_at=self.now - timedelta(minutes=16)
        )
        self.assertEqual(slack_channels.pick([healthy, failed], self.now), failed)

    def test_a_refused_channel_waits_behind_the_others_within_fifteen_minutes(self):
        healthy = self.row("C0HEALTHY", read_at=self.now - timedelta(days=3))
        failed = self.row(
            "C0FAILED", read_error="internal_error", asked_at=self.now - timedelta(minutes=5)
        )
        self.assertEqual(slack_channels.pick([healthy, failed], self.now), healthy)

    def test_at_most_one_catch_up_a_minute(self):
        row = self.row("C0ONE")
        self.assertTrue(slack_channels.history_due(self.support, self.now))
        SlackChannel.objects.filter(pk=row.pk).update(asked_at=self.now - timedelta(seconds=30))
        self.assertFalse(slack_channels.history_due(self.support, self.now))
        SlackChannel.objects.filter(pk=row.pk).update(asked_at=self.now - timedelta(seconds=61))
        self.assertTrue(slack_channels.history_due(self.support, self.now))

    def test_missed_threads_queue_once_each_and_at_most_fifty(self):
        row = self.row("C0ONE")
        slack_channels.remember_missed(row, "1792041400.000100")
        slack_channels.remember_missed(row, "1792041400.000100")
        for n in range(SlackChannel.MAX_MISSED + 1):
            slack_channels.remember_missed(row, f"17920415{n:02d}.000100")
        row.refresh_from_db()
        self.assertEqual(len(row.missed), SlackChannel.MAX_MISSED)
        self.assertNotIn("1792041400.000100", row.missed)  # the oldest went first
        self.assertEqual(slack_channels.next_missed([row]), (row, row.missed[0]))
        slack_channels.forget_missed(row, row.missed[0])
        row.refresh_from_db()
        self.assertEqual(len(row.missed), SlackChannel.MAX_MISSED - 1)
