"""Slack escalations D4, SE4-6, SE4-7: an escalation's reply may carry the
Jira key and link of an earlier step, never in a shared channel, checked at
proposal, on edit and at run. Slack and Jira are fakes."""

from services.agents import placeholders
from services.agents.actions import slack_replies
from services.agents.kinds import Invalid
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors.models import SlackChannel
from services.customers.models import SlackConversation

TEXT = "Thanks Faiz. Logged as {{step 1.ticket_key}} ({{step 1.ticket_url}})."
STEP = "/api/v1/agents/bundles/{}/steps/{}/"
DETAIL = "/api/v1/agents/bundles/{}/"


class PlaceholderRuleTests(OutsideFixture):
    def test_the_new_labels(self):
        self.assertEqual(placeholders.label(1, "ticket_key"), "Jira key from step 1")
        self.assertEqual(placeholders.label(2, "ticket_url"), "Jira link from step 2")

    def test_open_keys_pass_only_from_a_jira_create_or_assign(self):
        text = {"text": TEXT}
        placeholders.check(
            text, 2, {1: "jira.create"}, ("text",), open_keys=slack_replies.ESCALATION_KEYS
        )
        placeholders.check(
            text, 3, {1: "jira.assign"}, ("text",), open_keys=slack_replies.ESCALATION_KEYS
        )
        for kinds, keys in (
            ({1: "jira.comment"}, slack_replies.ESCALATION_KEYS),
            ({1: "jira.create"}, ()),
        ):
            with self.subTest(kinds=kinds, keys=keys), self.assertRaises(Invalid):
                placeholders.check(text, 2, kinds, ("text",), open_keys=keys)

    def test_fill_opens_only_the_open_keys_in_a_customer_facing_field(self):
        outputs = {
            1: {
                "ticket_key": "KAN-2",
                "ticket_url": "https://a.atlassian.net/browse/KAN-2",
                "task_id": 9,
            }
        }
        filled = placeholders.fill(
            {"text": TEXT + " {{step 1.task_id}}"},
            outputs,
            skip=("text",),
            open_keys=("ticket_key", "ticket_url"),
        )
        self.assertEqual(
            filled["text"],
            "Thanks Faiz. Logged as KAN-2 (https://a.atlassian.net/browse/KAN-2)."
            " {{step 1.task_id}}",
        )
        self.assertEqual(placeholders.fill({"text": TEXT}, outputs, skip=("text",))["text"], TEXT)

    def test_open_keys_need_an_escalation_and_an_unshared_channel(self):
        self.assertEqual(
            slack_replies.open_keys({"escalation": True, "external_shared": False}),
            ("ticket_key", "ticket_url"),
        )
        self.assertEqual(slack_replies.open_keys({"escalation": True, "external_shared": True}), ())
        self.assertEqual(slack_replies.open_keys({}), ())


class ReplyBase(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector(department="cs")
        self.support = self.slack_connector()
        self.conversation, self.thread = self.slack_thread(self.pizza, self.support)

    def bundle(self, text=TEXT, **flags):
        reply = {
            **self.slack_payload(self.conversation, self.support, text=text),
            "escalation": True,
            "external_shared": False,
            **flags,
        }
        return self.outside_bundle(
            self.thread, ("jira.create", self.jira_payload(self.board)), ("slack.reply", reply)
        )


class ReplyStepTests(ReplyBase):
    def test_the_reply_text_stays_editable_with_its_chips(self):
        bundle = self.bundle()
        body = self.client_for(self.csm).get(DETAIL.format(bundle.pk)).json()
        reply = body["steps"][1]
        self.assertIn("text", reply["editable"])
        self.assertEqual(
            [p["label"] for p in reply["placeholders"]],
            ["Jira key from step 1", "Jira link from step 1"],
        )

    def test_an_edit_keeps_the_jira_key_and_refuses_anything_else(self):
        bundle = self.bundle()
        reply = bundle.steps.get(position=2)
        client = self.client_for(self.csm)
        ok = client.patch(
            STEP.format(bundle.pk, reply.pk),
            {"fields": {"text": "On it: {{step 1.ticket_key}}."}},
            format="json",
        )
        self.assertEqual(ok.status_code, 200, ok.content)
        bad = client.patch(
            STEP.format(bundle.pk, reply.pk),
            {"fields": {"text": "See {{step 1.comment_url}}."}},
            format="json",
        )
        self.assertEqual(bad.json()["steps"][str(reply.pk)]["text"], [slack_replies.ONLY_JIRA])

    def test_a_non_escalation_reply_still_refuses_every_placeholder(self):
        bundle = self.bundle(text="Plain words.", escalation=False)
        reply = bundle.steps.get(position=2)
        answer = self.client_for(self.csm).patch(
            STEP.format(bundle.pk, reply.pk), {"fields": {"text": TEXT}}, format="json"
        )
        self.assertEqual(answer.json()["steps"][str(reply.pk)]["text"], [slack_replies.TO_CUSTOMER])

    def test_the_run_posts_the_real_key_and_link(self):
        bundle = self.bundle()
        self.assertEqual(self.run_all_steps(self.csm, bundle).status_code, 200)
        [post] = self.slack.posts
        self.assertEqual(
            post["text"],
            "Thanks Faiz. Logged as SUP-101 (https://acme.atlassian.net/browse/SUP-101).",
        )

    def test_a_channel_shared_since_the_proposal_never_gets_the_link(self):
        bundle = self.bundle()
        SlackConversation.objects.filter(pk=self.conversation.pk).update(external_shared=True)
        self.run_all_steps(self.csm, bundle)
        reply = bundle.steps.get(position=2)
        self.assertEqual((reply.status, reply.error), ("failed", slack_replies.SHARED_NOW))
        self.assertEqual(self.slack.posts, [])

    def test_shared_now_refuses_the_edit_as_today(self):
        bundle = self.bundle()
        SlackConversation.objects.filter(pk=self.conversation.pk).update(external_shared=True)
        reply = bundle.steps.get(position=2)
        answer = self.client_for(self.csm).patch(
            STEP.format(bundle.pk, reply.pk), {"fields": {"text": TEXT}}, format="json"
        )
        self.assertEqual(answer.json()["steps"][str(reply.pk)]["text"], [slack_replies.TO_CUSTOMER])


class MovedAndRetriedReplyTests(ReplyBase):
    """Fix round 1: a moved reply, a Retry after a shared channel, the
    connection's own flag, and the proposal-time check."""

    def other_channel(self):
        return self.slack_connector(channel="C0OTHER", name="other")

    def test_moving_the_reply_in_the_same_patch_is_judged_on_the_new_channel(self):
        bundle = self.bundle()
        other = self.other_channel()
        reply = bundle.steps.get(position=2)
        answer = self.client_for(self.csm).patch(
            STEP.format(bundle.pk, reply.pk),
            # D3 (SC3-18): another connection's channel is "<connection>:<channel>"
            {"fields": {"channel_choice": f"{other.pk}:C0OTHER", "text": TEXT}},
            format="json",
        )
        self.assertEqual(answer.json()["steps"][str(reply.pk)]["text"], [slack_replies.TO_CUSTOMER])

    def test_a_moved_reply_never_carries_the_key(self):
        self.assertEqual(
            slack_replies.open_keys(
                {
                    "escalation": True,
                    "external_shared": False,
                    "connector_id": 2,
                    "source_connector_id": 1,
                }
            ),
            (),
        )
        self.assertEqual(
            slack_replies.open_keys(
                {
                    "escalation": True,
                    "external_shared": False,
                    "connector_id": 1,
                    "source_connector_id": 1,
                    "unsynced": True,
                }
            ),
            (),
        )

    def test_a_reply_moved_without_a_text_change_fails_and_posts_nothing(self):
        bundle = self.bundle()
        other = self.other_channel()
        reply = bundle.steps.get(position=2)
        moved = self.client_for(self.csm).patch(
            STEP.format(bundle.pk, reply.pk),
            # D3 (SC3-18): a move to another connection names its channel
            {"fields": {"channel_choice": f"{other.pk}:C0OTHER"}},
            format="json",
        )
        self.assertEqual(moved.status_code, 200, moved.content)
        self.run_all_steps(self.csm, bundle)
        reply.refresh_from_db()
        self.assertEqual((reply.status, reply.error), ("failed", slack_replies.SHARED_NOW))
        self.assertEqual(self.slack.posts, [])

    def test_a_reply_moved_to_an_unsynced_channel_can_lose_its_key_and_post(self):
        """I-2: after SHARED_NOW the person takes the key out of the text with
        the Retry; the field holding it stays editable."""
        from django.core.cache import cache

        from services.connectors.tests.slack_fake import use_slack

        cache.clear()
        use_slack(self)
        self.support.granted_scopes = ["channels:read", "groups:read", "chat:write"]
        self.support.save()
        bundle = self.bundle()
        reply = bundle.steps.get(position=2)
        client = self.client_for(self.csm)
        moved = client.patch(
            STEP.format(bundle.pk, reply.pk),
            {"fields": {"channel_choice": f"{self.support.pk}:C0ESCALATE"}},
            format="json",
        )
        self.assertEqual(moved.status_code, 200, moved.content)
        self.run_all_steps(self.csm, bundle)
        reply.refresh_from_db()
        self.assertEqual((reply.status, reply.error), ("failed", slack_replies.SHARED_NOW))
        step = client.get(DETAIL.format(bundle.pk)).json()["steps"][1]
        self.assertIn("text", step["editable"])
        retried = self.retry(self.csm, reply, {"text": "Thanks Faiz. Engineering has it."})
        self.assertEqual(retried.status_code, 200, retried.content)
        reply.refresh_from_db()
        self.assertEqual(reply.status, "applied", reply.error)
        [post] = self.slack.posts
        self.assertEqual(
            (post["channel"], post["text"]), ("C0ESCALATE", "Thanks Faiz. Engineering has it.")
        )

    def test_a_retry_after_the_channel_became_shared_never_posts_the_key(self):
        bundle = self.bundle()
        self.slack.refuse_next("Slack said no.")
        self.run_all_steps(self.csm, bundle)
        reply = bundle.steps.get(position=2)
        self.assertEqual(reply.status, "failed")
        SlackConversation.objects.filter(pk=self.conversation.pk).update(external_shared=True)
        self.retry(self.csm, reply)
        reply.refresh_from_db()
        self.assertEqual((reply.status, reply.error), ("failed", slack_replies.SHARED_NOW))
        self.assertEqual(self.slack.posts, [])

    def test_a_retry_in_an_unshared_channel_still_posts(self):
        bundle = self.bundle()
        self.slack.refuse_next("Slack said no.")
        self.run_all_steps(self.csm, bundle)
        reply = bundle.steps.get(position=2)
        self.retry(self.csm, reply)
        reply.refresh_from_db()
        self.assertEqual(reply.status, "applied")
        self.assertIn("SUP-101", self.slack.posts[0]["text"])

    def test_the_channel_s_own_shared_flag_stops_the_run(self):
        bundle = self.bundle()
        # D3 (SC3-12): the conversation's channel row holds the flag
        SlackChannel.objects.filter(connector=self.support, channel_id="C0SUPPORT").update(
            external_shared=True
        )
        self.run_all_steps(self.csm, bundle)
        reply = bundle.steps.get(position=2)
        self.assertEqual((reply.status, reply.error), ("failed", slack_replies.SHARED_NOW))
        self.assertEqual(self.slack.posts, [])

    def test_the_channel_s_own_shared_flag_refuses_the_edit(self):
        bundle = self.bundle()
        # D3 (SC3-12): the conversation's channel row holds the flag
        SlackChannel.objects.filter(connector=self.support, channel_id="C0SUPPORT").update(
            external_shared=True
        )
        reply = bundle.steps.get(position=2)
        answer = self.client_for(self.csm).patch(
            STEP.format(bundle.pk, reply.pk), {"fields": {"text": TEXT}}, format="json"
        )
        self.assertEqual(answer.json()["steps"][str(reply.pk)]["text"], [slack_replies.TO_CUSTOMER])


class ProposalTimeTests(OutsideFixture):
    def proposed(self, shared):
        self.jira_connector(department="cs")
        support = self.slack_connector()
        conversation, thread = self.slack_thread(self.pizza, support)
        SlackConversation.objects.filter(pk=conversation.pk).update(external_shared=shared)
        ctx, _ = self.thread_ctx(thread)
        line = self.thread_line(ctx, "message ")
        ref = ctx.thread_ref
        raw = self.answer(
            {
                "kind": "jira.create",
                "record": ref,
                "title": "Log it",
                "rationale": "Engineering must fix it.",
                "evidence": [line],
                "payload": {"summary": "Login loop", "description": "Nobody can log in."},
            },
            {
                "kind": "slack.reply",
                "record": ref,
                "title": "Tell Ann",
                "rationale": "She is locked out.",
                "evidence": [line],
                "payload": {"text": "Logged as {{step 1.ticket_key}}."},
            },
        )
        self.run_intake(raw)
        return dict(
            thread.bundles.first().steps.order_by("position").values_list("kind", "payload__text")
        )

    def test_a_shared_thread_drops_the_reply_that_names_the_key(self):
        # Slack escalations D4 (SE4-5): the escalation's template takes its
        # place, with no key or link (SE4-7).
        self.assertEqual(
            self.proposed(shared=True)["slack.reply"], "Thanks Faiz. We've logged this."
        )

    def test_an_unshared_thread_keeps_it(self):
        self.assertEqual(
            self.proposed(shared=False)["slack.reply"], "Logged as {{step 1.ticket_key}}."
        )
