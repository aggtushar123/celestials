"""A Slack message sent to Work does its two things in one click each
(owner, 2026-10-16): the Jira issue (as the person, in the default project,
once) and the person's reply to the sender (as them, once, the issue's key
and link filled in when it exists). The owner's alone, like the message."""

import json
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings
from django.utils import timezone

from core.models import AuditEvent
from services.agents.tests.outside_fakes import use_fakes
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors import slack_interactivity
from services.customers.models import Ticket
from services.work import slack_actions
from services.work.models import SlackSuggestion

MODEL = "services.copilot.anthropic_client.get_completion"
FEED = "/api/v1/work/feed/?kind=slack_message"


def url(row, what):
    return f"/api/v1/work/slack-messages/{row.pk}/{what}/"


class DraftTests(SimpleTestCase):
    person = type("P", (), {"organisation": None, "name": "Carl Lee"})()

    def test_the_models_drafts_are_kept(self):
        answer = {
            "summary": "Twilio SSO fails after 2.4.",
            "step": "jira.create",
            "jira_summary": "Twilio: SSO fails after the 2.4 release",
            "jira_description": "Admins are locked out since 2.4.",
            "reply": "Thanks Faiz, looking now.",
            "reply_with_issue": "Thanks Faiz, logged as {issue}.",
        }
        with patch(MODEL, return_value=json.dumps(answer)) as model:
            made = slack_interactivity.draft(
                "Twilio SSO broke", person=self.person, sender="Faiz Jamal", record="Twilio"
            )
        self.assertEqual(
            made,
            {**answer, "reply": "Thanks Faiz, looking now.", "todo": ""},
        )
        prompt, messages = model.call_args.args
        self.assertEqual(messages, [{"role": "user", "content": "Twilio SSO broke"}])
        self.assertIn("from Faiz Jamal", prompt)
        self.assertIn("as Carl Lee", prompt)
        self.assertIn("about: Twilio", prompt)

    def test_gemini_is_held_to_the_drafts_shape(self):
        with patch(MODEL, return_value="{}") as model:
            slack_interactivity.draft("It broke.", person=self.person, sender="Faiz Jamal")
        schema = model.call_args.kwargs["response_schema"]
        self.assertEqual(schema, slack_interactivity.DRAFT_SCHEMA)
        self.assertIn("jira.create", schema["properties"]["step"]["enum"])

    def test_each_part_falls_back_alone_and_the_issue_reply_always_has_its_place(self):
        answer = {"summary": "S.", "reply_with_issue": "no placeholder here"}
        with patch(MODEL, return_value=json.dumps(answer)):
            made = slack_interactivity.draft("It broke.", person=self.person, sender="Faiz Jamal")
        self.assertEqual(made["summary"], "S.")
        self.assertEqual(made["jira_summary"], "It broke.")
        self.assertEqual(made["reply"], "Thanks Faiz, I'm looking into it.")
        self.assertIn("{issue}", made["reply_with_issue"])

    def test_a_failing_model_still_drafts(self):
        with patch(MODEL, side_effect=RuntimeError("down")):
            made = slack_interactivity.draft("It broke.", person=self.person, sender="Faiz Jamal")
        self.assertEqual((made["step"], made["jira_description"]), ("", "It broke."))
        self.assertIn("{issue}", made["reply_with_issue"])


@override_settings(SLACK_JIRA_PROJECT="KAN")
class SlackMessageActionTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.fakes = use_fakes(self)
        self.slack = self.slack_connector()
        self.jira = self.jira_connector(project="")
        self.fakes.jira.types["KAN"] = [
            {"id": "20001", "name": "Task", "detail": ""},
            {"id": "20002", "name": "Bug", "detail": ""},
        ]
        self.row = SlackSuggestion.objects.create(
            organisation=self.org,
            owner=self.csm,
            customer=self.pizza,
            summary="Pizza Hut SSO fails after 2.4.",
            text="Pizza Hut says SSO is failing again",
            sender_name="Faiz Jamal",
            sender_slack_id="U0FAIZ",
            team_id="T0ACME",
            channel="C0SUPPORT",
            message_ts="1760400000.000100",
            jira_summary="Pizza Hut: SSO fails after the 2.4 release",
            jira_description="Admins are locked out.",
            reply_draft="Thanks Faiz, looking now.",
            reply_with_issue="Thanks Faiz, logged as {issue}.",
        )

    def post(self, user, what, body=None):
        return self.client_for(user).post(url(self.row, what), body or {}, format="json")

    # --- the item -----------------------------------------------------------
    def test_the_item_carries_the_context_the_drafts_and_its_two_actions(self):
        Ticket.objects.create(
            customer=self.pizza,
            title="SSO login loop",
            ticket_number="TKT-9246",
            status="open",
            opened_at=timezone.now(),
        )
        body = self.client_for(self.csm).get(FEED).json()
        [item] = [i for g in body["groups"] for i in g["items"] if i["kind"] == "slack_message"]
        self.assertEqual(item["actions"], ["open", "dismiss", "jira", "reply"])
        detail = item["detail"]
        self.assertEqual(detail["context"]["owner"], self.pizza.owner.name)
        self.assertEqual([t["number"] for t in detail["open_tickets"]], ["TKT-9246"])
        self.assertEqual(
            detail["jira"],
            {
                "available": True,
                "project": "KAN",
                "summary": "Pizza Hut: SSO fails after the 2.4 release",
                "description": "Admins are locked out.",
                "key": "",
                "url": "",
            },
        )
        self.assertEqual(
            detail["reply"],
            {
                "to": "Faiz Jamal",
                "draft": "Thanks Faiz, looking now.",
                "with_issue": "Thanks Faiz, logged as {issue}.",
                "sent_at": None,
                "url": "",
            },
        )

    # --- Jira ---------------------------------------------------------------
    def test_create_in_jira_makes_one_issue_in_the_default_project_as_a_bug(self):
        response = self.post(self.csm, "jira", {"summary": "Pizza Hut: SSO down"})
        self.assertEqual(response.status_code, 200, response.content)
        key = response.json()["key"]
        self.assertTrue(key.startswith("KAN-"))
        fields = self.fakes.jira.issues[key]["fields"]
        self.assertEqual(
            (fields["project"], fields["issuetype"], fields["summary"]),
            ({"key": "KAN"}, {"id": "20002"}, "Pizza Hut: SSO down"),
        )
        self.row.refresh_from_db()
        self.assertEqual(self.row.jira_key, key)
        again = self.post(self.csm, "jira")
        self.assertEqual(again.json()["key"], key)
        self.assertEqual(len(self.fakes.jira.created), 1)
        event = AuditEvent.objects.get(action="slack.jira_created")
        self.assertEqual(event.metadata, {"issue": key})

    def test_a_create_whose_answer_was_lost_is_found_by_its_label_not_made_twice(self):
        self.fakes.jira.drop_next("create")
        self.assertEqual(self.post(self.csm, "jira").status_code, 400)
        found = self.post(self.csm, "jira")
        self.assertEqual(found.status_code, 200)
        self.assertEqual(len(self.fakes.jira.created), 1)

    def test_jira_refusing_says_why_and_keeps_nothing(self):
        self.fakes.jira.refuse_next("create", "Jira refused: no permission.")
        response = self.post(self.csm, "jira")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Jira refused: no permission.")
        self.row.refresh_from_db()
        self.assertEqual(self.row.jira_key, "")

    @override_settings(SLACK_JIRA_PROJECT="")
    def test_no_project_anywhere_is_a_plain_refusal(self):
        response = self.post(self.csm, "jira")
        self.assertEqual(response.status_code, 400)
        self.assertIn("project", response.json()["detail"])

    # --- the reply ----------------------------------------------------------
    def test_send_reply_posts_the_text_as_the_person_once(self):
        response = self.post(self.csm, "reply", {"text": "Thanks Faiz, on it."})
        self.assertEqual(response.status_code, 200, response.content)
        [posted] = self.fakes.slack.posts
        self.assertEqual(
            (posted["channel"], posted["thread_ts"], posted["text"], posted["actor"]),
            ("C0SUPPORT", "1760400000.000100", "Thanks Faiz, on it.", self.csm.pk),
        )
        self.row.refresh_from_db()
        self.assertIsNotNone(self.row.replied_at)
        self.assertEqual(self.post(self.csm, "reply", {"text": "again"}).status_code, 409)
        self.assertEqual(len(self.fakes.slack.posts), 1)
        self.assertEqual(AuditEvent.objects.get(action="slack.reply_sent").metadata, {})

    def test_a_direct_message_is_answered_in_the_conversation_not_a_thread(self):
        self.row.channel = "D0DM"
        self.row.save()
        self.post(self.csm, "reply", {"text": "On it."})
        self.assertEqual(self.fakes.slack.posts[0]["thread_ts"], "")

    def test_issue_placeholder_is_filled_once_the_issue_exists_and_refused_before(self):
        early = self.post(self.csm, "reply", {"text": "Logged as {issue}."})
        self.assertEqual(early.status_code, 400)
        key = self.post(self.csm, "jira").json()["key"]
        self.post(self.csm, "reply", {"text": "Logged as {issue}."})
        text = self.fakes.slack.posts[0]["text"]
        self.assertIn(key, text)
        self.assertIn("https://acme.atlassian.net/browse/", text)

    def test_an_empty_or_too_long_reply_is_refused(self):
        self.assertEqual(self.post(self.csm, "reply", {"text": "  "}).status_code, 400)
        self.assertEqual(self.post(self.csm, "reply", {"text": "x" * 3001}).status_code, 400)
        self.assertEqual(self.fakes.slack.posts, [])

    def test_slack_refusing_says_why(self):
        self.fakes.slack.refuse_next("Slack refused: not in that conversation.")
        response = self.post(self.csm, "reply", {"text": "On it."})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Slack refused: not in that conversation.")

    # --- privacy ------------------------------------------------------------
    def test_nobody_else_can_act_on_it_not_the_manager_not_an_admin(self):
        for user in (self.mona, self.admin):
            with self.subTest(user=user.email):
                self.assertEqual(self.post(user, "jira").status_code, 404)
                self.assertEqual(self.post(user, "reply", {"text": "Hi"}).status_code, 404)
        self.assertEqual(self.fakes.jira.created, [])
        self.assertEqual(self.fakes.slack.posts, [])


@override_settings(SLACK_JIRA_PROJECT="KAN")
class SharedChannelReplyTests(OutsideFixture):
    """SE4-19 (owner decision 11): the person's reply never carries the Jira
    key or link into a channel shared outside the workspace."""

    def setUp(self):
        super().setUp()
        self.fakes = use_fakes(self)
        self.slack_connector()
        self.row = SlackSuggestion.objects.create(
            organisation=self.org,
            owner=self.csm,
            customer=self.pizza,
            summary="SSO fails.",
            text="Pizza Hut SSO fails",
            sender_name="Faiz Jamal",
            sender_slack_id="U0FAIZ",
            team_id="T0ACME",
            channel="C0SUPPORT",
            message_ts="1760400000.000100",
            reply_with_issue="Thanks Faiz, logged as {issue}.",
            jira_key="KAN-7",
            jira_url="https://acme.atlassian.net/browse/KAN-7",
        )

    def reply(self, text):
        return self.client_for(self.csm).post(url(self.row, "reply"), {"text": text}, format="json")

    def test_the_link_in_a_shared_channel_is_refused_and_nothing_posts(self):
        self.fakes.slack.shared_channels.add("C0SUPPORT")
        answer = self.reply(
            "Thanks Faiz, logged as KAN-7 (https://acme.atlassian.net/browse/KAN-7)."
        )
        self.assertEqual(
            (answer.status_code, answer.json()), (400, {"detail": slack_actions.SHARED})
        )
        self.assertEqual(self.fakes.slack.posts, [])

    def test_slack_that_cant_say_refuses_the_link(self):
        self.fakes.slack.cant_say = True
        answer = self.reply("Logged as {issue}.")
        self.assertEqual(answer.json(), {"detail": slack_actions.CANT_CHECK})

    def test_the_link_in_an_unshared_channel_posts(self):
        self.assertEqual(self.reply("Logged as {issue}.").status_code, 200)
        self.assertEqual(
            self.fakes.slack.posts[0]["text"],
            "Logged as KAN-7 (https://acme.atlassian.net/browse/KAN-7).",
        )

    def test_a_lower_case_key_or_link_in_a_shared_channel_is_refused(self):
        self.fakes.slack.shared_channels.add("C0SUPPORT")
        for text in (
            "Logged as kan-7.",
            "See https://ACME.atlassian.net/browse/kan-7",
            "See https://acme.atlassian.net/browse/KAN-9",
        ):
            with self.subTest(text=text):
                self.assertEqual(self.reply(text).json(), {"detail": slack_actions.SHARED})
        self.assertEqual(self.fakes.slack.posts, [])

    def test_a_reply_without_the_link_is_never_checked(self):
        self.fakes.slack.shared_channels.add("C0SUPPORT")
        self.assertEqual(self.reply("Thanks Faiz, looking now.").status_code, 200)
        self.assertEqual(self.fakes.slack.shared_asked, [])
