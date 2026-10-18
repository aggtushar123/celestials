"""Send to Revenact (Connections spec §3, option A): Slack's signed
interactivity request makes one suggestion in the clicker's own Work and
nowhere else. Slack and the model are fakes; nothing leaves the process."""

import hashlib
import hmac
import json
import secrets
import time
from unittest.mock import patch
from urllib.parse import urlencode

from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors import slack_interactivity
from services.connectors.tests.slack_fake import use_slack
from services.connectors.tests.test_slack_link_views import slack_link_for
from services.customers.models import Contact
from services.work.models import SlackSuggestion

URL = "/api/v1/connectors/slack/interactivity/"
#: A fresh signing secret per run: never a real one.
SIGNING = secrets.token_hex(16)
FEED = "/api/v1/work/feed/"
TEAM_FEED = "/api/v1/work/feed/team/"
MODEL = "services.copilot.anthropic_client.get_completion"
HOOK = "https://hooks.slack.com/actions/T0ACME/1/abc"


def sign(body, *, secret=SIGNING, at=None):
    stamp = str(int(at if at is not None else time.time()))
    digest = hmac.new(secret.encode(), f"v0:{stamp}:".encode() + body, hashlib.sha256)
    return stamp, "v0=" + digest.hexdigest()


def action(
    user="U0CARL",
    *,
    team="T0ACME",
    text="Hi Carl, Pizza Hut's SSO is broken since this morning.",
    sender="U0ANN",
    kind="message_action",
    callback="send_to_revenact",
):
    return {
        "type": kind,
        "callback_id": callback,
        "team": {"id": team, "domain": "acme"},
        "user": {"id": user, "name": "someone"},
        "channel": {"id": "D0DM", "name": "directmessage"},
        "message_ts": "1760400000.000100",
        "message": {"type": "message", "user": sender, "ts": "1760400000.000100", "text": text},
        "response_url": HOOK,
        "trigger_id": "1.2.3",
    }


@override_settings(SLACK_SIGNING_SECRET=SIGNING)
class SignatureTests(SimpleTestCase):
    def test_a_good_signature_passes(self):
        body = b"payload=%7B%7D"
        stamp, signature = sign(body)
        self.assertTrue(slack_interactivity.verified(body, stamp, signature))

    def test_a_changed_body_a_wrong_secret_an_old_or_future_stamp_fail(self):
        body = b"payload=%7B%7D"
        stamp, signature = sign(body)
        self.assertFalse(slack_interactivity.verified(body + b"x", stamp, signature))
        self.assertFalse(slack_interactivity.verified(body, *sign(body, secret="another-secret")))
        self.assertFalse(slack_interactivity.verified(body, *sign(body, at=time.time() - 6 * 60)))
        self.assertFalse(slack_interactivity.verified(body, *sign(body, at=time.time() + 6 * 60)))
        self.assertFalse(slack_interactivity.verified(body, "not-a-number", signature))
        self.assertFalse(slack_interactivity.verified(body, stamp, ""))

    def test_no_secret_verifies_nothing(self):
        body = b"payload=%7B%7D"
        with override_settings(SLACK_SIGNING_SECRET=""):
            self.assertFalse(slack_interactivity.verified(body, *sign(body, secret="")))


class SummaryTests(SimpleTestCase):
    def test_the_prompt_sends_bugs_and_outages_to_jira(self):
        self.assertIn("jira.create when", slack_interactivity.SUMMARY_PROMPT)

    def setUp(self):
        self.person = type("P", (), {"organisation": None})()

    def test_the_models_json_is_kept_when_valid(self):
        answer = json.dumps({"summary": "SSO broken at Pizza Hut.", "step": "jira.create"})
        with patch(MODEL, return_value=f"```json\n{answer}\n```"):
            self.assertEqual(
                slack_interactivity.summarise("text", person=self.person),
                ("SSO broken at Pizza Hut.", "jira.create"),
            )

    def test_an_unknown_step_is_dropped(self):
        answer = json.dumps({"summary": "Do it.", "step": "record.owner"})
        with patch(MODEL, return_value=answer):
            self.assertEqual(
                slack_interactivity.summarise("text", person=self.person), ("Do it.", "")
            )

    def test_a_failing_or_rambling_model_falls_back_to_the_first_200_characters(self):
        text = "word " * 100
        for effect in (RuntimeError("down"), None):
            with self.subTest(effect=effect):
                kwargs = {"side_effect": effect} if effect else {"return_value": "Sure! Here"}
                with patch(MODEL, **kwargs):
                    summary, step = slack_interactivity.summarise(text, person=self.person)
                self.assertEqual((len(summary), step), (200, ""))
                self.assertTrue(summary.startswith("word word"))


@override_settings(SLACK_SIGNING_SECRET=SIGNING, SLACK_OAUTH_CLIENT_ID="cid")
class InteractivityRouteTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.channel = self.slack_connector()
        self.api = use_slack(self)
        self.replies = []
        hook = patch.object(
            slack_interactivity,
            "reply",
            side_effect=lambda url, text: self.replies.append((url, text)),
        )
        hook.start()
        self.addCleanup(hook.stop)
        self.model = patch(
            MODEL,
            return_value=json.dumps(
                {"summary": "Pizza Hut's SSO is broken.", "step": "jira.create"}
            ),
        )
        self.model.start()
        self.addCleanup(self.model.stop)

    def send(self, payload, *, body=None, headers=None):
        body = body if body is not None else urlencode({"payload": json.dumps(payload)}).encode()
        stamp, signature = sign(body)
        signed = {"HTTP_X_SLACK_REQUEST_TIMESTAMP": stamp, "HTTP_X_SLACK_SIGNATURE": signature}
        return APIClient().generic(
            "POST",
            URL,
            body,
            content_type="application/x-www-form-urlencoded",
            **(signed if headers is None else headers),
        )

    def feed_items(self, user, url=FEED):
        body = self.client_for(user).get(url).json()
        return [
            item
            for group in body.get("groups", [])
            for item in group["items"]
            if item["kind"] == "slack_message"
        ]

    # --- the signature ---------------------------------------------------
    def test_a_missing_bad_or_old_signature_is_refused_and_nothing_is_made(self):
        slack_link_for(self.csm)
        body = urlencode({"payload": json.dumps(action())}).encode()
        stamp, signature = sign(body)
        old_stamp, old_signature = sign(body, at=time.time() - 301)
        cases = {
            "missing": {},
            "bad": {"HTTP_X_SLACK_REQUEST_TIMESTAMP": stamp, "HTTP_X_SLACK_SIGNATURE": "v0=00"},
            "old": {
                "HTTP_X_SLACK_REQUEST_TIMESTAMP": old_stamp,
                "HTTP_X_SLACK_SIGNATURE": old_signature,
            },
        }
        for name, headers in cases.items():
            with self.subTest(name):
                self.assertEqual(self.send(None, body=body, headers=headers).status_code, 401)
        self.assertFalse(SlackSuggestion.objects.exists())
        self.assertEqual(self.replies, [])
        self.assertEqual(signature[:3], "v0=")

    def test_an_empty_secret_refuses_every_request(self):
        slack_link_for(self.csm)
        with override_settings(SLACK_SIGNING_SECRET=""):
            self.assertEqual(self.send(action()).status_code, 401)
        self.assertFalse(SlackSuggestion.objects.exists())

    def test_the_public_url_is_throttled_per_ip(self):
        from django.core.cache import cache

        from core.throttling import SlackInteractivityThrottle

        cache.clear()
        with patch.object(SlackInteractivityThrottle, "rate", "1/min"):
            self.assertEqual(self.send(action(kind="block_actions")).status_code, 200)
            self.assertEqual(self.send(action(kind="block_actions")).status_code, 429)
        cache.clear()

    def test_get_is_not_allowed(self):
        self.assertEqual(APIClient().get(URL).status_code, 405)

    # --- what is ignored -------------------------------------------------
    def test_other_interactions_are_ignored_with_200(self):
        slack_link_for(self.csm)
        for payload in (
            action(kind="block_actions"),
            action(callback="something_else"),
            action(kind="shortcut"),
        ):
            with self.subTest(payload["type"], cb=payload["callback_id"]):
                self.assertEqual(self.send(payload).status_code, 200)
        self.assertFalse(SlackSuggestion.objects.exists())
        self.assertEqual(self.replies, [])

    def test_a_signed_body_that_isnt_a_payload_is_400(self):
        self.assertEqual(self.send(None, body=b"payload=not-json").status_code, 400)

    # --- unmatched -------------------------------------------------------
    def test_an_unmatched_person_is_asked_to_link_and_nothing_is_made(self):
        self.api.users["U0NOBODY"] = {"real_name": "No Body", "profile": {"email": "x@else.io"}}
        self.assertEqual(self.send(action("U0NOBODY")).status_code, 200)
        self.assertFalse(SlackSuggestion.objects.exists())
        self.assertEqual(
            self.replies,
            [(HOOK, "Link your Slack account in Revenact (Settings › Connections) first.")],
        )
        self.assertFalse(AuditEvent.objects.filter(action="slack.message_sent_to_work").exists())

    def test_a_slack_team_no_workspace_connected_matches_nobody(self):
        slack_link_for(self.csm)
        self.send(action(team="T0ELSEWHERE"))
        self.assertFalse(SlackSuggestion.objects.exists())
        self.assertEqual(len(self.replies), 1)

    def test_a_link_in_another_tenant_never_matches(self):
        slack_link_for(self.stranger, slack_user_id="U0GUS")
        self.send(action("U0GUS"))
        self.assertFalse(SlackSuggestion.objects.exists())

    # --- matched ---------------------------------------------------------
    def test_a_linked_person_gets_one_private_suggestion(self):
        slack_link_for(self.csm)
        Contact.objects.create(customer=self.pizza, name="Ann Lee", email="ann@pizzahut.com")
        self.assertEqual(self.send(action()).status_code, 200)
        made = SlackSuggestion.objects.get()
        self.assertEqual(
            (made.owner, made.customer, made.summary, made.sender_name, made.suggested_kind),
            (self.csm, self.pizza, "Pizza Hut's SSO is broken.", "Ann Lee", "jira.create"),
        )
        self.assertEqual(made.text, "Hi Carl, Pizza Hut's SSO is broken since this morning.")
        self.assertEqual(made.permalink, "https://slack.com/archives/D0DM/p1760400000000100")
        # Slack bundles: its bundle is proposed on the next tick, never in Slack's 3 seconds.
        self.assertEqual(made.bundle_state, "pending")
        self.assertEqual(self.replies, [(HOOK, "Sent to your Work.")])
        event = AuditEvent.objects.get(action="slack.message_sent_to_work")
        self.assertEqual(event.actor, self.csm)
        self.assertEqual(
            event.metadata,
            {
                "matched_by": "link",
                "customer": self.pizza.pk,
                "account": None,
                "suggested_step": "jira.create",
            },
        )
        self.assertNotIn("SSO", json.dumps(event.metadata))

        [item] = self.feed_items(self.csm)
        self.assertEqual(
            (item["title"], item["record"], item["private"], item["from"]),
            (
                "Pizza Hut's SSO is broken.",
                {"type": "customer", "id": self.pizza.pk, "name": "Pizza Hut"},
                True,
                {"type": "slack", "label": "Slack"},
            ),
        )
        self.assertEqual(
            item["detail"]["suggested_step"],
            {"kind": "jira.create", "label": "Create a Jira issue"},
        )
        self.assertEqual(item["detail"]["sender"], "Ann Lee")

    def test_nobody_else_sees_or_dismisses_it_not_the_manager_not_an_admin(self):
        slack_link_for(self.csm)
        self.send(action())
        made = SlackSuggestion.objects.get()
        for user in (self.mona, self.admin, self.other, self.lee):
            with self.subTest(user=user.email):
                self.assertEqual(self.feed_items(user), [])
                self.assertEqual(self.feed_items(user, TEAM_FEED), [])
                self.assertEqual(
                    self.client_for(user)
                    .delete(f"/api/v1/work/slack-messages/{made.pk}/")
                    .status_code,
                    404,
                )
        self.assertEqual(len(self.feed_items(self.csm)), 1)
        self.assertEqual(
            self.client_for(self.csm).delete(f"/api/v1/work/slack-messages/{made.pk}/").status_code,
            204,
        )
        self.assertFalse(SlackSuggestion.objects.exists())
        self.assertTrue(AuditEvent.objects.filter(action="slack.message_dismissed").exists())

    def test_matched_by_email_when_there_is_no_link(self):
        self.send(action("U0CARL"))
        made = SlackSuggestion.objects.get()
        self.assertEqual(made.owner, self.csm)
        self.assertEqual(
            AuditEvent.objects.get(action="slack.message_sent_to_work").metadata["matched_by"],
            "email",
        )

    def test_a_customer_the_person_cannot_open_is_never_named(self):
        slack_link_for(self.csm)
        Contact.objects.create(customer=self.soup, name="Ann Lee", email="ann@pizzahut.com")
        self.send(action(text="Hi Carl, SSO is broken since this morning."))
        self.assertIsNone(SlackSuggestion.objects.get().customer)

    def test_a_message_from_a_colleague_is_filed_on_the_customer_it_names(self):
        # Live test 2026-10-16: an internal sender has no contact, so the
        # customer comes from the name in the message, as channel sync does.
        slack_link_for(self.csm)
        self.send(action(text="Pizza Hut says SSO is failing again", sender="U0FAIZ"))
        self.assertEqual(SlackSuggestion.objects.get().customer, self.pizza)

    def test_a_named_customer_the_person_cannot_open_is_never_named(self):
        slack_link_for(self.csm)
        self.send(action(text="Soup Co says SSO is failing again", sender="U0FAIZ"))
        self.assertIsNone(SlackSuggestion.objects.get().customer)

    def test_two_customers_named_is_neither(self):
        slack_link_for(self.csm)
        self.send(action(text="Pizza Hut and Dough Co both report it", sender="U0FAIZ"))
        self.assertIsNone(SlackSuggestion.objects.get().customer)

    def test_the_same_message_twice_is_one_suggestion(self):
        slack_link_for(self.csm)
        self.send(action())
        self.send(action())
        self.assertEqual(SlackSuggestion.objects.count(), 1)
        self.assertEqual(AuditEvent.objects.filter(action="slack.message_sent_to_work").count(), 1)

    def test_the_message_is_kept_and_summarised_as_slack_shows_it(self):
        slack_link_for(self.csm)
        with patch(MODEL, return_value="{}") as model:
            self.send(
                action(text=":wave: Hi <@U0CARL>, see <#C0SUP|support> &amp; <https://x.com|docs>")
            )
        made = SlackSuggestion.objects.get()
        self.assertEqual(made.text, "👋 Hi @Carl Lee, see #support & docs (https://x.com)")
        self.assertEqual(model.call_args.args[1], [{"role": "user", "content": made.text}])

    def test_a_failing_model_falls_back_to_the_text(self):
        slack_link_for(self.csm)
        with patch(MODEL, side_effect=RuntimeError("model down")):
            self.send(action(text="Short note from Ann."))
        made = SlackSuggestion.objects.get()
        self.assertEqual((made.summary, made.suggested_kind), ("Short note from Ann.", ""))
        self.assertEqual(self.replies, [(HOOK, "Sent to your Work.")])

    def test_only_the_one_message_goes_to_the_model(self):
        slack_link_for(self.csm)
        with patch(MODEL, return_value="{}") as model:
            self.send(action(text="Only this."))
        messages = model.call_args.args[1]
        self.assertEqual(messages, [{"role": "user", "content": "Only this."}])
        self.assertEqual(model.call_args.kwargs["purpose"], "slack_triage")


class ReplyTests(SimpleTestCase):
    def test_only_slacks_hooks_host_is_called(self):
        with patch("services.connectors.providers.slack.http_call") as call:
            self.assertFalse(slack_interactivity.reply("https://evil.test/hook", "x"))
            self.assertFalse(slack_interactivity.reply("http://hooks.slack.com/a", "x"))
            self.assertTrue(slack_interactivity.reply(HOOK, "Sent to your Work."))
        call.assert_called_once()
        self.assertEqual(
            call.call_args.kwargs["data"],
            {"response_type": "ephemeral", "replace_original": False, "text": "Sent to your Work."},
        )
