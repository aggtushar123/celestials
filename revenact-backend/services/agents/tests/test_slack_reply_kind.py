"""slack.reply (agent bundles D3 contract §2.2, §3, §6, D3-4, D3-10, D3-11,
D3-24). Slack is a fake: nothing is posted."""

from django.core.cache import cache

from core.models import AuditEvent
from services.agents.actions import slack_replies
from services.agents.evidence import Context
from services.agents.kinds import Invalid
from services.agents.tests.outside_fixtures import OutsideFixture

STEP = "/api/v1/agents/bundles/{}/steps/{}/"
DETAIL = "/api/v1/agents/bundles/{}/"


class SlackReplyTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.support = self.slack_connector()
        self.conversation, self.thread = self.slack_thread(self.pizza, self.support)
        self.bundle = self.outside_bundle(
            self.thread, ("slack.reply", self.slack_payload(self.conversation, self.support))
        )
        self.step = self.bundle.steps.get()

    def test_the_model_writes_the_text_only(self):
        ctx = Context(self.org, "cs", self.today)
        ctx.thread_lines = ['    message 1: from "Ann Lee", 2025-10-13T07:19: "Nobody can log in"']
        ctx.thread_slack = {
            "id": self.conversation.pk,
            "record": f"customer:{self.pizza.pk}",
            "connector_id": self.support.pk,
            "channel": self.support.config["channel"],
            "channel_name": self.support.config["channel_name"],
            "thread_ts": self.conversation.thread_ts,
            "usable": True,
        }
        row = {"ref": f"customer:{self.pizza.pk}"}
        clean = slack_replies.validate(
            {"text": " On it ", "channel": "C0EVIL"}, row, ctx, [ctx.thread_lines[0].strip()]
        )
        self.assertEqual(
            clean,
            {
                **self.slack_payload(self.conversation, self.support, text="On it"),
                "channel_choice": str(self.support.pk),
            },
        )
        ctx.thread_slack["record"] = f"customer:{self.taco.pk}"
        with self.assertRaises(Invalid):
            slack_replies.validate({"text": "On it"}, row, ctx, [])
        ctx.thread_slack = None
        with self.assertRaises(Invalid):
            slack_replies.validate({"text": "On it"}, row, ctx, [])

    def test_a_run_posts_in_the_thread_as_the_app(self):
        step = self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()["steps"][0]
        self.assertEqual(
            step["preview"]["slack"],
            {
                "channel": "#support",
                "in_thread": True,
                "synced": True,
                "as": "revenact",
                "as_you": False,
                "excerpt": "We're on it: the fix ships Friday.",
            },
        )
        self.assertEqual(self.run_all_steps(self.csm, self.bundle).status_code, 200)
        self.assertEqual(
            [(p["channel"], p["thread_ts"], p["key"]) for p in self.slack.posts],
            [("C0SUPPORT", self.conversation.thread_ts, f"b{self.bundle.pk}-s{self.step.pk}")],
        )
        self.step.refresh_from_db()
        self.assertEqual(self.step.status, "applied")
        self.assertEqual(set(self.step.outputs), {"slack_ts", "slack_url"})
        links = (
            self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()["steps"][0]["links"]
        )
        self.assertEqual(
            [(link["label"], link["external"]) for link in links],
            [("Open the Slack message", True)],
        )

    def test_a_reply_may_mention_only_the_people_in_its_conversation(self):
        # Owner, 2026-10-18: the posted reply read "<@U0C9...>"; the people the
        # conversation already holds are passed on as mentions, nobody else.
        self.conversation.people = {"U0PRIYA": {"name": "Priya"}, "U0TUSHAR": {"name": "Tushar"}}
        self.conversation.messages = [
            *(self.conversation.messages or []),
            {"user_id": "U0JESH", "name": "Jesh", "text": "hi"},
        ]
        self.conversation.save(update_fields=["people", "messages"])
        self.assertEqual(self.run_all_steps(self.csm, self.bundle).status_code, 200)
        self.assertTrue({"U0PRIYA", "U0TUSHAR", "U0JESH"} <= self.slack.posts[-1]["mentions"])
        self.assertNotIn("U0STRANGER", self.slack.posts[-1]["mentions"])

    def test_moving_it_to_another_channel_posts_at_the_top_level(self):
        escalations = self.slack_connector(channel="C0ESCALATE", name="escalations")
        url = STEP.format(self.bundle.pk, self.step.pk)
        moved = self.client_for(self.csm).patch(
            url, {"fields": {"channel_choice": f"{escalations.pk}:C0ESCALATE"}}, format="json"
        )
        self.assertEqual(moved.status_code, 200, moved.content)
        self.assertEqual(moved.json()["bundle"]["steps"][0]["preview"]["slack"]["in_thread"], False)
        self.run_all_steps(self.csm, self.bundle)
        self.assertEqual(
            [(p["channel"], p["thread_ts"]) for p in self.slack.posts], [("C0ESCALATE", "")]
        )

    def test_a_channel_the_runner_cant_read_is_refused(self):
        engineering = self.slack_connector(department="engineering", channel="C0ENG", name="eng")
        bad = self.client_for(self.csm).patch(
            STEP.format(self.bundle.pk, self.step.pk),
            {"fields": {"connector_id": engineering.pk}},
            format="json",
        )
        self.assertEqual(
            bad.json(),
            {
                "steps": {
                    str(self.step.pk): {"connector_id": ["Choose a Slack channel Revenact reads."]}
                }
            },
        )
        placeholder = self.client_for(self.csm).patch(
            STEP.format(self.bundle.pk, self.step.pk),
            {"fields": {"text": "See {{step 1.ticket_url}}"}},
            format="json",
        )
        self.assertEqual(
            placeholder.json()["steps"][str(self.step.pk)],
            {"text": ["This goes to a customer, so it can't use another step's result."]},
        )

    def test_a_read_only_slack_fails_the_step_with_the_gate(self):
        self.support.agents_can_act = False
        self.support.save(update_fields=["agents_can_act"])
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(
            (self.step.status, self.step.error),
            ("failed", "Ask an admin to allow Revenact to post in Slack."),
        )
        self.assertEqual(self.slack.posts, [])

    def test_a_lost_answer_is_found_on_retry(self):
        self.slack.drop_next()
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(
            self.step.error, "We couldn't confirm the Slack post. Retry checks the channel first."
        )
        self.retry(self.mona, self.step)
        self.step.refresh_from_db()
        self.assertEqual((self.step.status, len(self.slack.posts)), ("applied", 1))
        self.assertTrue(
            AuditEvent.objects.filter(
                action="agent_outside.call", metadata__outcome="found"
            ).exists()
        )

    def test_a_refused_lookup_is_on_the_trail(self):
        self.slack.drop_next()
        self.run_all_steps(self.csm, self.bundle)
        self.slack.refuse_find("Slack refused the lookup.")
        self.retry(self.csm, self.step)
        self.step.refresh_from_db()
        self.assertEqual(
            (self.step.status, self.step.error), ("failed", "Slack refused the lookup.")
        )
        lookup = AuditEvent.objects.get(action="agent_outside.call", metadata__op="lookup")
        self.assertEqual(
            (lookup.metadata["outcome"], lookup.metadata["where"]), ("refused", "C0SUPPORT")
        )
        self.assertEqual(len(self.slack.posts), 1)

    def test_a_moved_failed_step_looks_where_it_was_tried_first(self):
        escalations = self.slack_connector(channel="C0ESCALATE", name="escalations")
        self.slack.drop_next()
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(self.step.status, "failed")
        moved = self.retry(
            self.csm, self.step, fields={"channel_choice": f"{escalations.pk}:C0ESCALATE"}
        )
        self.assertEqual(moved.status_code, 200, moved.content)
        self.step.refresh_from_db()
        self.assertEqual(self.step.status, "applied", self.step.error)
        # It was found in the thread it was first posted to: nothing posted again.
        self.assertEqual(
            [(p["channel"], p["thread_ts"]) for p in self.slack.posts],
            [("C0SUPPORT", self.conversation.thread_ts)],
        )
        self.assertEqual(self.slack.looked_in, [("C0SUPPORT", self.conversation.thread_ts)])
        self.assertEqual(self.step.result["channel"], "C0SUPPORT")

    def test_a_moved_step_after_a_refusal_looks_and_posts_in_its_new_channel(self):
        escalations = self.slack_connector(channel="C0ESCALATE", name="escalations")
        self.slack.refuse_next("Slack didn't accept the message.")
        self.run_all_steps(self.csm, self.bundle)
        self.retry(self.csm, self.step, fields={"channel_choice": f"{escalations.pk}:C0ESCALATE"})
        self.step.refresh_from_db()
        self.assertEqual(self.step.status, "applied", self.step.error)
        # Slack refused the first post: nothing can be in the thread, so it isn't read.
        self.assertEqual(self.slack.looked_in, [("C0ESCALATE", "")])
        self.assertEqual(
            [(p["channel"], p["thread_ts"]) for p in self.slack.posts], [("C0ESCALATE", "")]
        )

    def test_it_cant_be_undone(self):
        self.run_all_steps(self.csm, self.bundle)
        undo = self.client_for(self.csm).post(f"/api/v1/agents/actions/{self.step.pk}/undo/")
        self.assertEqual(undo.json()["detail"], "This Slack message has been posted.")


class UnsyncedChannelTests(OutsideFixture):
    """Round 2 D2 contract §4.2, §4.3, R2D2-15, R2D2-18: a step moved to a
    channel the bot is in that no connector syncs."""

    def setUp(self):
        super().setUp()
        from django.core.cache import cache

        from services.connectors.tests.slack_fake import use_slack

        cache.clear()
        self.api = use_slack(self)
        self.api.names.update({"G0LEADS": "leads"})
        self.api.channels.update({"G0LEADS": []})
        self.api.members.add("G0LEADS")
        self.api.private.add("G0LEADS")
        self.support = self.slack_connector()
        self.support.granted_scopes = ["channels:read", "groups:read", "chat:write"]
        self.support.save()
        self.conversation, self.thread = self.slack_thread(self.pizza, self.support)
        self.bundle = self.outside_bundle(
            self.thread, ("slack.reply", self.slack_payload(self.conversation, self.support))
        )
        self.step = self.bundle.steps.get()

    def save(self, user, choice):
        return self.client_for(user).patch(
            STEP.format(self.bundle.pk, self.step.pk),
            {"fields": {"channel_choice": choice}},
            format="json",
        )

    def detail(self, user):
        return self.client_for(user).get(DETAIL.format(self.bundle.pk)).json()

    def test_moving_to_an_unsynced_channel_posts_a_new_message_there(self):
        answer = self.save(self.csm, f"{self.support.pk}:C0ESCALATE")
        self.assertEqual(answer.status_code, 200, answer.content)
        self.step.refresh_from_db()
        self.assertEqual(
            {
                k: self.step.payload[k]
                for k in (
                    "connector_id",
                    "channel",
                    "channel_name",
                    "unsynced",
                    "channel_private",
                    "channel_choice",
                )
            },
            {
                "connector_id": self.support.pk,
                "channel": "C0ESCALATE",
                "channel_name": "escalations",
                "unsynced": True,
                "channel_private": False,
                "channel_choice": f"{self.support.pk}:C0ESCALATE",
            },
        )
        step = self.detail(self.csm)["steps"][0]
        self.assertEqual(
            (step["preview"]["slack"]["in_thread"], step["preview"]["slack"]["synced"]),
            (False, False),
        )
        self.assertEqual(step["preview"]["slack"]["channel"], "#escalations")
        self.assertEqual(step["fields"]["channel_choice"], f"{self.support.pk}:C0ESCALATE")
        self.assertEqual(step["editable"], ["connector_id", "channel_choice", "text"])
        self.run_all_steps(self.csm, self.bundle)
        [post] = self.slack.posts
        self.assertEqual((post["channel"], post["thread_ts"]), ("C0ESCALATE", ""))

    def test_an_unsynced_post_names_its_own_channel(self):
        from unittest.mock import patch

        self.save(self.csm, f"{self.support.pk}:C0ESCALATE")
        with patch.object(self.slack, "post", wraps=self.slack.post) as post:
            self.run_all_steps(self.csm, self.bundle)
        self.assertEqual(post.call_args.kwargs["channel_name"], "#escalations")

    def test_an_old_step_reads_its_connector_as_its_choice(self):
        self.assertNotIn("channel_choice", self.step.payload)
        step = self.detail(self.csm)["steps"][0]
        self.assertEqual(step["fields"]["channel_choice"], str(self.support.pk))
        self.assertEqual(step["preview"]["slack"]["synced"], True)
        self.assertEqual(step["preview"]["slack"]["in_thread"], True)

    def test_choosing_a_synced_id_moves_back_to_the_thread(self):
        pk = self.support.pk
        self.save(self.csm, f"{pk}:C0ESCALATE")
        self.assertEqual(self.save(self.csm, str(pk)).status_code, 200)
        self.step.refresh_from_db()
        self.assertEqual(
            {k: self.step.payload[k] for k in ("channel", "unsynced", "channel_choice")},
            {"channel": "C0SUPPORT", "unsynced": False, "channel_choice": str(pk)},
        )
        self.run_all_steps(self.csm, self.bundle)
        [post] = self.slack.posts
        self.assertEqual(
            (post["channel"], post["thread_ts"]), ("C0SUPPORT", self.conversation.thread_ts)
        )

    def test_refusals(self):
        pk = self.support.pk

        def refused(user, choice):
            return self.save(user, choice).json()["steps"][str(self.step.pk)]["channel_choice"]

        self.assertEqual(
            self.save(self.csm, "nonsense").json(),
            {
                "steps": {
                    str(self.step.pk): {"channel_choice": ["Choose a Slack channel from the list."]}
                }
            },
        )
        self.assertEqual(refused(self.csm, 6), ["Choose a Slack channel from the list."])
        self.assertEqual(
            refused(self.csm, f"{pk + 99}"), ["Choose a Slack channel Revenact reads."]
        )
        # An existing Slack connector Carl can't read (another department's channel).
        theirs = self.slack_connector(department="engineering", channel="C0ENG", name="eng")
        self.assertEqual(
            refused(self.csm, str(theirs.pk)), ["Choose a Slack channel Revenact reads."]
        )
        self.assertEqual(
            refused(self.csm, f"{theirs.pk}:C0ESCALATE"), ["Choose a Slack channel Revenact reads."]
        )
        self.assertEqual(
            refused(self.csm, f"{pk}:C0NOPE"), ["Choose a channel the Revenact app is in."]
        )
        # A channel another connection of the workspace syncs is its row alone (R2D2-15).
        self.api.names["C0ENG"] = "eng"
        self.api.channels["C0ENG"] = []
        self.api.members.add("C0ENG")
        cache.clear()
        self.assertEqual(
            refused(self.csm, f"{pk}:C0ENG"), ["Choose a channel the Revenact app is in."]
        )
        # The thread's own channel is a synced row of the connection (SC3-18).
        self.assertEqual(self.save(self.csm, f"{pk}:C0SUPPORT").status_code, 200)
        self.assertEqual(
            refused(self.csm, f"{pk}:G0LEADS"),
            ["Only an admin can choose a private channel Revenact doesn't read."],
        )
        self.assertEqual(self.save(self.admin, f"{pk}:G0LEADS").status_code, 200)

    def test_a_channel_synced_since_the_choice_refuses_the_run(self):
        self.save(self.csm, f"{self.support.pk}:C0ESCALATE")
        self.slack_connector(department="engineering", channel="C0ESCALATE", name="escalations")
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(
            (self.step.status, self.step.error),
            ("failed", "Choose a Slack channel from the list."),
        )
        self.assertEqual(self.slack.posts, [])

    def legacy(self, **kwargs):
        """A Slack connector made before connectors stored their team id."""
        made = self.slack_connector(**kwargs)
        made.config.pop("team_id")
        made.save()
        return made

    def test_connector_id_of_another_connection_is_refused(self):
        # SOC2:AUTH-02 the source's channel is never posted through another bot (SC3-18)
        other = self.slack_connector(channel="C0OTHER", name="other")
        answer = self.client_for(self.csm).patch(
            STEP.format(self.bundle.pk, self.step.pk),
            {"fields": {"connector_id": other.pk}},
            format="json",
        )
        self.assertEqual(answer.status_code, 400)
        self.assertEqual(
            answer.json()["steps"][str(self.step.pk)]["connector_id"],
            ["Choose a Slack channel from the list."],
        )
        self.step.refresh_from_db()
        self.assertEqual(self.step.payload["connector_id"], self.support.pk)

    def test_a_channel_a_legacy_connector_syncs_cant_be_chosen(self):
        # Synced is the channel id alone (R2D2-15), team id or not.
        self.legacy(department="engineering", channel="C0ESCALATE", name="escalations")
        answer = self.save(self.csm, f"{self.support.pk}:C0ESCALATE")
        self.assertEqual(
            answer.json()["steps"][str(self.step.pk)]["channel_choice"],
            ["Choose a channel the Revenact app is in."],
        )

    def test_a_channel_a_legacy_connector_syncs_since_the_choice_refuses_the_run(self):
        self.save(self.csm, f"{self.support.pk}:C0ESCALATE")
        self.legacy(department="engineering", channel="C0ESCALATE", name="escalations")
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(
            (self.step.status, self.step.error),
            ("failed", "Choose a Slack channel from the list."),
        )
        self.assertEqual(self.slack.posts, [])

    def test_a_list_that_cant_be_read_refuses(self):
        self.api.refuse_next("users.conversations", "ratelimited")
        answer = self.save(self.csm, f"{self.support.pk}:C0ESCALATE")
        self.assertEqual(
            answer.json()["steps"][str(self.step.pk)]["channel_choice"],
            ["Couldn't check Slack's channels. Try again."],
        )

    def test_a_private_unsynced_step_is_blocked_for_a_non_admin(self):
        self.save(self.admin, f"{self.support.pk}:G0LEADS")
        bundle = self.detail(self.csm)
        step = bundle["steps"][0]
        self.assertEqual(
            step["disabled_reason"],
            "Only an admin can post in #leads, a private channel Revenact doesn't read.",
        )
        # No link: nothing to fix in Settings; Carl may still reject (D3-10).
        self.assertEqual((step["can_run"], step["disabled_link"]), (False, None))
        self.assertTrue(bundle["can_reject"])
        admin = self.detail(self.admin)["steps"][0]
        self.assertEqual((admin["can_run"], admin["disabled_reason"]), (True, None))
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(
            (self.step.status, self.step.error),
            (
                "failed",
                "Only an admin can post in #leads, a private channel Revenact doesn't read.",
            ),
        )
        self.assertEqual(self.slack.posts, [])

    def test_the_old_panel_still_moves_by_connector_id(self):
        self.save(self.csm, f"{self.support.pk}:C0ESCALATE")
        answer = self.client_for(self.csm).patch(
            STEP.format(self.bundle.pk, self.step.pk),
            {"fields": {"connector_id": self.support.pk}},
            format="json",
        )
        self.assertEqual(answer.status_code, 200)
        self.step.refresh_from_db()
        self.assertEqual(
            {k: self.step.payload[k] for k in ("channel", "unsynced", "channel_choice")},
            {"channel": "C0SUPPORT", "unsynced": False, "channel_choice": str(self.support.pk)},
        )
