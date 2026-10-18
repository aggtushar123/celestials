"""Slack escalations D1 contract §3, SE1-15, SE1-16: a Slack thread is a
conversation in the story, read department-wise."""

from django.utils import timezone

from services.customers.tests.slack_fixtures import msg

from .story_fixtures import StoryFixture


class StorySlackTests(StoryFixture):
    def test_it_is_a_conversation_with_its_channel_and_replies(self):
        made = self.slack(
            self.pizza,
            channel_name="all-alfiee",
            messages=[msg("1.1"), msg("1.2", "Ann"), msg("1.3", "revenact", bot=True)],
            last_message_at=timezone.now(),
        )
        body = self.story(group="conversations")
        item = next(i for i in body["items"] if i["kind"] == "slack")
        self.assertEqual(
            (item["id"], item["source"], item["summary"], item["replies"], item["all_day"]),
            (made.pk, "slack", "#all-alfiee · 2 replies", 2, False),
        )
        self.assertEqual(item["actor"], {"id": None, "name": "Faiz Jamal"})
        self.assertEqual(body["counts"]["by_kind"]["slack"], 1)
        self.assertEqual(body["counts"]["by_group"]["tickets"], 0)

    def test_department_wise(self):
        made = self.slack(self.pizza, department="engineering")
        self.assertEqual(self.story()["counts"]["by_kind"]["slack"], 0)  # Carl is CS
        self.assertEqual(list(self.base("slack", user=self.admin)), [made])
        open_co = self.customer("Open Co", owner=None)
        theirs = self.slack(open_co, department="engineering")
        self.assertEqual(list(self.base("slack", user=self.engineer, customer=open_co)), [theirs])

    def test_search_reads_the_title_poster_and_channel(self):
        self.slack(self.pizza, channel_name="escalations")
        self.assertEqual(self.story(q="escalations")["counts"]["by_kind"]["slack"], 1)
        self.assertEqual(self.story(q="nothing like it")["counts"]["by_kind"]["slack"], 0)

    def test_a_member_is_the_actor(self):
        self.slack(self.pizza, started_by=self.csm)
        item = self.story()["items"][0]
        self.assertEqual(item["actor"], {"id": self.csm.pk, "name": self.csm.name})
