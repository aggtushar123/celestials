"""A Slack bundle in Work (Slack bundles, owner 2026-10-17): while it stands
(waiting, running, run or rejected) its bundle item replaces the message's
card in the sender's Work; expired or superseded, the card comes back. The
bundle names its source as the Slack message, for its sender alone."""

from datetime import timedelta

from django.utils import timezone

from services.agents.models import AgentBundle
from services.agents.tests.slack_bundle_fixtures import BUNDLE, FEED, SlackBundleFixture


class SlackBundleFeedTests(SlackBundleFixture):
    def items(self, user, kind):
        body = self.client_for(user).get(FEED).json()
        return [i for g in body["groups"] for i in g["items"] if i["kind"] == kind]

    def test_the_bundle_replaces_the_card_while_it_stands(self):
        row = self.slack_row(self.csm, self.pizza)
        self.assertEqual([i["id"] for i in self.items(self.csm, "slack_message")], [row.pk])
        bundle = self.slack_bundle(row)
        self.assertEqual(self.items(self.csm, "slack_message"), [])
        self.assertEqual([i["id"] for i in self.items(self.csm, "bundle")], [bundle.pk])
        for status, card in (
            ("running", False),
            ("done", False),
            ("partly_done", False),
            ("rejected", False),
            ("expired", True),
            ("superseded", True),
        ):
            with self.subTest(status=status):
                AgentBundle.objects.filter(pk=bundle.pk).update(status=status)
                shown = [i["id"] for i in self.items(self.csm, "slack_message")]
                self.assertEqual(shown, [row.pk] if card else [])

    def test_a_bundle_past_its_14_days_gives_the_card_back(self):
        row = self.slack_row(self.csm, self.pizza)
        bundle = self.slack_bundle(row)
        AgentBundle.objects.filter(pk=bundle.pk).update(
            created_at=timezone.now() - timedelta(days=15)
        )
        self.assertEqual([i["id"] for i in self.items(self.csm, "slack_message")], [row.pk])

    def test_the_bundle_item_and_its_source_block(self):
        row = self.slack_row(self.csm, self.pizza)
        bundle = self.slack_bundle(row)
        [item] = self.items(self.csm, "bundle")
        self.assertEqual(
            item["detail"]["source"],
            {"kind": "slack_message", "label": "Slack message", "channel": None},
        )
        self.assertEqual((item["detail"]["routed_to"], item["detail"]["can_run"]), ("person", True))
        body = self.client_for(self.csm).get(BUNDLE.format(bundle.pk)).json()
        self.assertEqual(
            body["source"],
            {
                "kind": "slack_message",
                "label": "Slack message",
                "sender": "Faiz Jamal",
                "excerpt": row.text,
                "text": row.text,
                "link": row.permalink,
                "at": body["source"]["at"],
                "private": True,
            },
        )
        self.assertIsNotNone(body["source"]["at"])
        self.assertEqual(
            (body["routed_to"], body["for"]["id"], body["can_refresh"]),
            ("person", self.csm.pk, False),
        )

    def test_a_dismissed_message_leaves_an_empty_block(self):
        row = self.slack_row(self.csm, self.pizza)
        bundle = self.slack_bundle(row)
        response = self.client_for(self.csm).delete(f"/api/v1/work/slack-messages/{row.pk}/")
        self.assertEqual(response.status_code, 204)
        body = self.client_for(self.csm).get(BUNDLE.format(bundle.pk)).json()
        self.assertEqual(
            body["source"],
            {
                "kind": "slack_message",
                "label": "Slack message",
                "sender": "",
                "excerpt": "",
                "text": "",
                "link": None,
                "at": None,
                "private": True,
            },
        )

    def test_the_feed_count_follows_what_it_shows(self):
        row = self.slack_row(self.csm, self.pizza)
        self.slack_bundle(row)
        body = self.client_for(self.csm).get(f"{FEED}?kind=slack_message").json()
        suggested = next(g for g in body["groups"] if g["key"] == "suggested")
        self.assertEqual((suggested["count"], suggested["items"]), (0, []))
