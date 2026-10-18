"""Slack handover (owner, 2026-10-18): "Send to Revenact" on a message that
tags colleagues hands it to each tagged member who could read it in Slack:
a to-do from the clicker, and their own copy of the message (its card
hidden, its bundle theirs alone). The clicker keeps a copy that says whom
it went to and gets no plan. Slack and the model are fakes."""

import json
from unittest.mock import patch
from urllib.parse import urlencode

from django.test import override_settings
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.agents.tests.bundle_fixtures import BUNDLES
from services.agents.tests.slack_bundle_fixtures import FEED, SlackBundleFixture
from services.connectors import slack_handover, slack_interactivity
from services.connectors.tests.slack_fake import use_slack
from services.connectors.tests.test_slack_interactivity import HOOK, SIGNING, URL, action, sign
from services.connectors.tests.test_slack_link_views import slack_link_for
from services.customers.models import Task
from services.customers.scoping import can_open
from services.notifications.models import Notification
from services.work.models import SlackSuggestion

MODEL = "services.copilot.anthropic_client.get_completion"
ASK = "<@U0MONA> can you give an update on the Pizza Hut accounts?"
TODO = "Give an update on the Pizza Hut accounts"


def tagged(text=ASK, channel="C0SUPPORT", **kwargs):
    payload = action(text=text, sender="U0FAIZ", **kwargs)
    payload["channel"] = {"id": channel, "name": "support"}
    return payload


@override_settings(SLACK_SIGNING_SECRET=SIGNING, SLACK_OAUTH_CLIENT_ID="cid")
class SlackHandoverTests(SlackBundleFixture):
    def setUp(self):
        super().setUp()
        self.channel = self.slack_connector()
        self.api = use_slack(self)
        self.api.users.update(
            {
                "U0MONA": {"real_name": "Mona Manager", "profile": {"email": "mona@acme.io"}},
                "U0DANA": {"real_name": "Dana CSM", "profile": {"email": "dana@acme.io"}},
                "U0BOTX": {"real_name": "Deploy Bot", "is_bot": True, "profile": {}},
                "U0OUT": {"real_name": "Out Sider", "profile": {"email": "out@else.io"}},
            }
        )
        self.replies = []
        hook = patch.object(
            slack_interactivity,
            "reply",
            side_effect=lambda url, text: self.replies.append((url, text)),
        )
        hook.start()
        self.addCleanup(hook.stop)
        self.answer(todo=TODO)
        slack_link_for(self.csm)
        # The world the tests assume: Mona may open Pizza Hut, Dana may not.
        self.assertTrue(can_open(self.mona, self.pizza))
        self.assertFalse(can_open(self.other, self.pizza))

    def answer(self, **extra):
        model = patch(
            MODEL,
            return_value=json.dumps(
                {"summary": "Carl is asked for a Pizza Hut update.", "step": "task.create", **extra}
            ),
        )
        model.start()
        self.addCleanup(model.stop)

    def send(self, payload):
        body = urlencode({"payload": json.dumps(payload)}).encode()
        stamp, signature = sign(body)
        response = APIClient().generic(
            "POST",
            URL,
            body,
            content_type="application/x-www-form-urlencoded",
            HTTP_X_SLACK_REQUEST_TIMESTAMP=stamp,
            HTTP_X_SLACK_SIGNATURE=signature,
        )
        self.assertEqual(response.status_code, 200)

    def items(self, user, kind):
        body = self.client_for(user).get(FEED).json()
        return [i for g in body["groups"] for i in g["items"] if i["kind"] == kind]

    def slack_calls(self):
        return [c[0] for c in self.api.calls if c[0].startswith("conversations.")]

    # --- handed over -------------------------------------------------------
    def test_a_tagged_colleague_gets_a_task_from_the_clicker(self):
        self.send(tagged())
        task = Task.objects.get()
        self.assertEqual(
            (task.title, task.assignee, task.created_by, task.customer, task.source),
            (TODO, self.mona, self.csm, self.pizza, "manual"),
        )
        self.assertIsNotNone(task.due_date)  # a task on a record is always dated
        self.assertIn("Sent from Slack by Carl CSM.", task.description)
        self.assertIn("@Mona Manager can you give an update", task.description)
        self.assertIn("https://slack.com/archives/C0SUPPORT/p1760400000000100", task.description)
        note = Notification.objects.get(recipient=self.mona)
        self.assertEqual((note.kind, note.actor), ("task_assigned", self.csm))
        self.assertIn("Carl CSM assigned you", note.message)

        theirs = SlackSuggestion.objects.get(owner=self.mona)
        self.assertEqual(
            (theirs.handed_from, theirs.task, theirs.customer, theirs.bundle_state),
            (self.csm, task, self.pizza, "pending"),
        )
        mine = SlackSuggestion.objects.get(owner=self.csm)
        self.assertEqual(mine.handed_to, [{"id": self.mona.pk, "name": "Mona Manager"}])
        self.assertEqual((mine.bundle_state, mine.handed_from, mine.task), ("none", None, None))
        self.assertEqual(
            self.replies, [(HOOK, "Sent to Mona Manager's Work in Revenact. Kept in your Work.")]
        )
        event = AuditEvent.objects.get(action="slack.handed_over")
        self.assertEqual(event.actor, self.csm)
        self.assertEqual(
            event.metadata,
            {"handed_to": [self.mona.pk], "handed": 1, "tasks": [task.pk], "not_in_channel": 0},
        )
        self.assertNotIn("Pizza", json.dumps(event.metadata))

    def test_the_feeds_the_task_for_them_the_handed_card_for_the_clicker(self):
        self.send(tagged())
        self.assertEqual(self.items(self.mona, "slack_message"), [])  # the card is hidden
        [item] = [i for i in self.items(self.mona, "task") if i["title"] == TODO]
        self.assertEqual(
            item["detail"]["from_slack"],
            {
                "by": "Carl CSM",
                "permalink": "https://slack.com/archives/C0SUPPORT/p1760400000000100",
            },
        )
        self.assertEqual(item["from"], {"type": "slack", "label": "From Slack by Carl CSM"})
        [card] = self.items(self.csm, "slack_message")
        mona = {"id": self.mona.pk, "name": "Mona Manager"}
        self.assertEqual(card["detail"]["handed_to"], [mona])

    def test_a_colleague_who_cannot_open_the_record_gets_a_plain_to_do(self):
        self.send(tagged(text="<@U0DANA> can you give an update on the Pizza Hut accounts?"))
        task = Task.objects.get()
        self.assertEqual(
            (task.assignee, task.created_by, task.customer, task.account, task.due_date),
            (self.other, self.other, None, None, None),
        )
        self.assertIsNone(SlackSuggestion.objects.get(owner=self.other).customer)
        note = Notification.objects.get(recipient=self.other)
        self.assertEqual((note.kind, note.actor), ("task_assigned", self.csm))
        self.assertEqual(note.message, f"Carl CSM sent you “{TODO}” from Slack.")
        [item] = self.items(self.other, "todo")
        self.assertEqual(item["detail"]["from_slack"]["by"], "Carl CSM")
        self.assertIsNone(item["record"])
        # The clicker never reads the colleague's to-do.
        self.assertEqual([i for i in self.items(self.csm, "todo") if i["title"] == TODO], [])

    def test_their_bundle_is_theirs_alone(self):
        self.send(tagged())
        theirs = SlackSuggestion.objects.get(owner=self.mona)
        bundle = self.slack_bundle(theirs)
        self.assertEqual(bundle.routed_user, self.mona)
        status = {
            u.name: self.client_for(u).get(f"{BUNDLES}{bundle.pk}/").status_code
            for u in (self.mona, self.csm, self.admin)
        }
        self.assertEqual(status, {"Mona Manager": 200, "Carl CSM": 404, "Alice Admin": 404})
        self.assertEqual([i["id"] for i in self.items(self.mona, "bundle")], [bundle.pk])
        self.assertEqual(self.items(self.mona, "slack_message"), [])

    def test_the_proposer_makes_the_tagged_persons_bundle_for_them(self):
        from services.agents import slack_bundles

        self.send(tagged())
        theirs = SlackSuggestion.objects.get(owner=self.mona)
        none = slack_bundles.Outcome(state="none")
        with patch.object(slack_bundles, "propose", return_value=none) as made:
            slack_bundles.propose_pending()
        [(row, person)] = [call.args for call in made.call_args_list]
        self.assertEqual((row.pk, person), (theirs.pk, self.mona))

    def test_a_double_click_hands_it_over_once(self):
        self.send(tagged())
        self.send(tagged())
        self.assertEqual(Task.objects.count(), 1)
        self.assertEqual(SlackSuggestion.objects.filter(owner=self.mona).count(), 1)
        mine = SlackSuggestion.objects.get(owner=self.csm)
        self.assertEqual(mine.handed_to, [{"id": self.mona.pk, "name": "Mona Manager"}])
        self.assertEqual(AuditEvent.objects.filter(action="slack.handed_over").count(), 1)
        self.assertEqual(Notification.objects.filter(recipient=self.mona).count(), 1)

    def test_two_colleagues_each_get_theirs(self):
        self.send(tagged(text="<@U0MONA> <@U0DANA> please look at the Pizza Hut accounts"))
        self.assertEqual(
            set(Task.objects.values_list("assignee__email", flat=True)),
            {"mona@acme.io", "dana@acme.io"},
        )
        self.assertEqual(
            self.replies[-1][1],
            "Sent to Mona Manager and Dana CSM's Work in Revenact. Kept in your Work.",
        )

    # --- not handed over -----------------------------------------------------
    def test_no_tag_is_exactly_as_before(self):
        self.send(tagged(text="Pizza Hut says SSO is failing again"))
        mine = SlackSuggestion.objects.get()
        self.assertEqual((mine.owner, mine.handed_to, mine.bundle_state), (self.csm, [], "pending"))
        self.assertFalse(Task.objects.exists())
        self.assertEqual(self.replies, [(HOOK, "Sent to your Work.")])
        self.assertEqual(self.slack_calls(), [])
        self.assertFalse(AuditEvent.objects.filter(action="slack.handed_over").exists())
        [card] = self.items(self.csm, "slack_message")
        self.assertEqual(card["detail"]["handed_to"], [])

    def test_the_clicker_a_bot_and_unknown_people_are_never_handed_it(self):
        self.send(tagged(text="<@U0CARL> <@U0BOTX> <@U0OUT> please check the Pizza Hut accounts"))
        self.assertEqual(SlackSuggestion.objects.get().owner, self.csm)
        self.assertFalse(Task.objects.exists())
        self.assertEqual(self.replies, [(HOOK, "Sent to your Work.")])
        self.assertEqual(self.slack_calls(), [])

    def test_someone_in_another_tenant_is_never_handed_it(self):
        self.api.users["U0GUS"] = {"real_name": "Gus", "profile": {"email": "gus@globex.io"}}
        self.send(tagged(text="<@U0GUS> please check the Pizza Hut accounts"))
        self.assertFalse(Task.objects.exists())
        self.assertFalse(SlackSuggestion.objects.filter(owner=self.stranger).exists())

    def test_a_private_channel_hands_it_only_to_its_members(self):
        self.api.channels["G0PRIV"] = []
        self.api.names["G0PRIV"] = "private-cs"
        self.api.private.add("G0PRIV")
        self.api.channel_members["G0PRIV"] = ["U0CARL", "U0MONA"]
        self.send(
            tagged(
                text="<@U0MONA> <@U0DANA> please look at the Pizza Hut accounts", channel="G0PRIV"
            )
        )
        self.assertEqual(list(Task.objects.values_list("assignee", flat=True)), [self.mona.pk])
        self.assertFalse(SlackSuggestion.objects.filter(owner=self.other).exists())
        self.assertEqual(
            self.replies,
            [
                (
                    HOOK,
                    "Sent to Mona Manager's Work in Revenact. Kept in your Work. "
                    "Not sent to Dana CSM: they aren't in this channel.",
                )
            ],
        )
        event = AuditEvent.objects.get(action="slack.handed_over")
        self.assertEqual(event.metadata["not_in_channel"], 1)

    def test_a_conversation_slack_wont_describe_is_handed_to_nobody(self):
        # A DM the bot isn't in: membership can't be verified, so nobody gets it.
        self.send(tagged(channel="D0DM"))
        self.assertFalse(Task.objects.exists())
        mine = SlackSuggestion.objects.get()
        self.assertEqual((mine.handed_to, mine.bundle_state), ([], "pending"))
        self.assertEqual(
            self.replies,
            [(HOOK, "Sent to your Work. Not sent to Mona Manager: they aren't in this channel.")],
        )

    def test_without_the_models_to_do_the_title_is_the_message_without_its_mentions(self):
        self.assertEqual(
            slack_handover.title_of("<@U0MONA>, <@U0DANA> give an update :fire:", "", lambda _: ""),
            "Give an update 🔥",
        )
        self.assertEqual(slack_handover.title_of("<@U0MONA>", "", lambda _: ""), "A Slack message")
        self.assertEqual(len(slack_handover.title_of("x" * 300, "", lambda _: "")), 120)
        self.assertEqual(slack_handover.title_of(ASK, "Do it", lambda _: ""), "Do it")
