"""Slack messages sent to Work (Connections spec §3): the suggested group
interleaves them with Revenact's recommendations, names a record only while
the owner may open it, filters by kind, and the 30-day retention deletes them."""

from datetime import timedelta

from django.utils import timezone

from core.models import AuditEvent
from services.customers.models import Customer
from services.work import feed_slack, slack_views
from services.work.models import SlackSuggestion
from services.work.tests.feed_fixtures import FeedFixture


class SlackSuggestionFeedTests(FeedFixture):
    def slack(self, owner, customer=None, n=1):
        return SlackSuggestion.objects.create(
            organisation=owner.organisation,
            owner=owner,
            customer=customer,
            summary=f"Slack {n}",
            text="Ann: SSO is down.",
            sender_name="Ann Lee",
            team_id="T0ACME",
            channel="D0DM",
            message_ts=f"1760000000.{n:06d}",
            permalink="https://slack.com/archives/D0DM/p1760000000000001",
            suggested_kind="jira.create",
        )

    def test_it_sits_in_the_suggested_group_with_recommendations(self):
        self.suggestion(self.csm, self.pizza, kind="renewal_due")
        made = self.slack(self.csm, self.pizza)
        group = self.group(self.body(self.csm), "suggested")
        self.assertEqual(group["count"], 2)
        self.assertEqual([i["kind"] for i in group["items"]], ["slack_message", "suggestion"])
        item = group["items"][0]
        self.assertEqual(
            (item["key"], item["actions"], item["detail"]["permalink"], item["detail"]["text"]),
            (
                f"slack_message:{made.pk}",
                ["open", "dismiss", "jira", "reply"],
                "https://slack.com/archives/D0DM/p1760000000000001",
                "Ann: SSO is down.",
            ),
        )

    def test_the_kind_filter(self):
        self.suggestion(self.csm, self.pizza, kind="renewal_due")
        self.slack(self.csm, self.pizza)
        only = self.group(self.body(self.csm, kind="slack_message"), "suggested")
        self.assertEqual([i["kind"] for i in only["items"]], ["slack_message"])
        recs = self.group(self.body(self.csm, kind="suggestion"), "suggested")
        self.assertEqual([i["kind"] for i in recs["items"]], ["suggestion"])

    def test_a_record_no_longer_open_to_the_owner_is_not_named(self):
        mine = Customer.objects.create(organisation=self.org, name="Mine Co", owner=self.csm)
        self.slack(self.csm, mine)
        [item] = self.group(self.body(self.csm), "suggested")["items"]
        self.assertEqual(item["record"]["name"], "Mine Co")
        Customer.objects.filter(pk=mine.pk).update(owner=self.other)
        [item] = self.group(self.body(self.csm), "suggested")["items"]
        self.assertIsNone(item["record"])

    def test_no_record_is_fine(self):
        self.slack(self.csm)
        [item] = self.group(self.body(self.csm), "suggested")["items"]
        self.assertIsNone(item["record"])

    def test_it_is_never_anyone_elses(self):
        self.slack(self.csm, self.pizza)
        self.assertEqual(feed_slack.mine(self.other).count(), 0)
        self.assertEqual(feed_slack.mine(self.csm).count(), 1)

    def test_retention_deletes_after_30_days(self):
        old = self.slack(self.csm, n=1)
        fresh = self.slack(self.csm, n=2)
        SlackSuggestion.objects.filter(pk=old.pk).update(
            created_at=timezone.now() - timedelta(days=31)
        )
        self.assertEqual(slack_views.purge(), 1)
        self.assertEqual(list(SlackSuggestion.objects.values_list("pk", flat=True)), [fresh.pk])
        event = AuditEvent.objects.get(action="slack.messages_purged")
        self.assertEqual(event.metadata, {"deleted": 1})
        self.assertEqual(slack_views.purge(), 0)
