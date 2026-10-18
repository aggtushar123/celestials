"""The outside facade (agent bundles D3 contract §3, §6, D3-11, D3-14):
real tool classes against fake vendors, the contract's sentences, the key,
the look-back window and the trail. Nothing leaves the process."""

from datetime import datetime, timedelta
from unittest.mock import patch

from django.test import SimpleTestCase
from django.utils import timezone

from core.models import AuditEvent
from services.agents.outside import keys, sentences, tools, trail
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors.providers.base import ProviderError
from services.connectors.providers.jira import adf
from services.connectors.tests.jira_fake import use_jira
from services.connectors.tests.slack_fake import BASE_SCOPES, FakeSlackApi, use_slack


class SentenceTests(SimpleTestCase):
    def test_slack(self):
        cases = {
            "not_in_channel": "Slack refused the post: the app isn't in #support.",
            "channel_not_found": "Slack can't find #support any more.",
            "is_archived": "Slack refused the post: #support is archived.",
            "missing_scope": "Allow Revenact to post in Slack, then Retry.",
            "token_revoked": "Your Slack connection expired. Reconnect it, then Retry.",
            "ratelimited": "Slack is busy. Retry in a minute.",
            "msg_too_long": "Slack refused the post: the message is too long.",
            "fatal_error": "Slack refused the post. Retry it.",
        }
        for code, sentence in cases.items():
            with self.subTest(code=code):
                self.assertEqual(
                    sentences.slack(ProviderError("x", code=code, status=200), "#support"), sentence
                )
        self.assertEqual(
            sentences.slack(ProviderError("x"), "#support"), "Couldn't reach Slack. Retry it."
        )

    def test_a_pick_list_reads_jira_as_a_run_does(self):
        def failure(status, **where):
            return sentences.list_failure(ProviderError("x", status=status), **where)

        self.assertEqual(
            failure(401),
            ("TOOL_REFUSED", "Jira refused the login. Reconnect Jira, then try again.", 409),
        )
        self.assertEqual(
            failure(404, issue="SUP-12"), ("TOOL_NOT_FOUND", "Jira can't find SUP-12.", 409)
        )
        self.assertEqual(
            failure(404, project="SUP"),
            ("TOOL_NOT_FOUND", "Jira can't find the project SUP.", 409),
        )
        self.assertEqual(
            failure(404),
            ("TOOL_NOT_FOUND", "Jira can't find this site. Check the Jira connection.", 409),
        )
        self.assertEqual(failure(429), ("TOOL_BUSY", "Jira is busy. Try again in a minute.", 409))
        self.assertEqual(
            failure(None), ("TOOL_UNREACHABLE", "Couldn't reach Jira. Try again.", 502)
        )
        self.assertEqual(failure(500), ("TOOL_UNREACHABLE", "Couldn't reach Jira. Try again.", 502))

    def test_jira(self):
        def refused(status, body=None):
            return ProviderError("x", status=status, body=body)

        self.assertEqual(
            sentences.jira(refused(401), project="SUP"),
            "Jira refused the login. Reconnect Jira, then Retry.",
        )
        self.assertEqual(
            sentences.jira(refused(403), issue="SUP-12"),
            "The Jira account can't do this in SUP-12. Give it permission in Jira, then Retry.",
        )
        self.assertEqual(
            sentences.jira(refused(404), project="SUP"), "Jira can't find the project SUP."
        )
        self.assertEqual(sentences.jira(refused(404), issue="SUP-12"), "Jira can't find SUP-12.")
        self.assertEqual(
            sentences.jira(
                refused(400, {"errors": {"components": "Component/s is required."}}), project="SUP"
            ),
            "Jira says the project SUP needs a component.",
        )
        self.assertEqual(
            sentences.jira(
                refused(400, {"errors": {"customfield_10010": "Team is required."}}),
                project="SUP",
            ),
            "Jira says the project SUP needs another field.",
        )
        self.assertEqual(
            sentences.jira(
                refused(400, {"errors": {"assignee": "User cannot be assigned."}}),
                issue="SUP-12",
                assignee="Priya Shah",
            ),
            "Jira won't assign SUP-12 to Priya Shah.",
        )
        self.assertEqual(
            sentences.jira(
                refused(400, {"errorMessages": ["The summary is too long."]}), project="SUP"
            ),
            "Jira refused this: The summary is too long.",
        )
        self.assertEqual(
            sentences.jira(refused(None), project="SUP"), "Couldn't reach Jira. Retry it."
        )
        self.assertEqual(
            sentences.no_user("priya@acme.io"),
            "Jira has no user with priya@acme.io. "
            "Choose the assignee from Jira's list, then Retry.",
        )


class RealToolTests(OutsideFixture):
    def test_slack_tool_posts_finds_and_words_a_refusal(self):
        api = use_slack(self, FakeSlackApi(scopes=[*BASE_SCOPES, "chat:write"]))
        connector = self.slack_connector()
        tool = tools.SlackTool()
        posted = tool.post(
            connector,
            channel="C0SUPPORT",
            channel_name="#support",
            text="On it",
            thread_ts="1760339999.000100",
            key="b1-s2",
        )
        self.assertTrue(posted.url.startswith("https://slack.com/archives/C0SUPPORT/p"))
        since = timezone.now() - timedelta(hours=1)
        found = tool.find(
            connector,
            channel="C0SUPPORT",
            channel_name="#support",
            key="b1-s2",
            thread_ts="1760339999.000100",
            since=since,
        )
        self.assertEqual(found.ts, posted.ts)
        api.refuse_next("chat.postMessage", "not_in_channel")
        with self.assertRaises(tools.Refused) as caught:
            tool.post(
                connector,
                channel="C0SUPPORT",
                channel_name="#support",
                text="On it",
                thread_ts="",
                key="b1-s3",
            )
        self.assertEqual(
            caught.exception.sentence, "Slack refused the post: the app isn't in #support."
        )
        api.drop_next("chat.postMessage")
        with self.assertRaises(tools.Unconfirmed) as caught:
            tool.post(
                connector,
                channel="C0SUPPORT",
                channel_name="#support",
                text="On it",
                thread_ts="",
                key="b1-s4",
            )
        self.assertEqual(caught.exception.sentence, sentences.SLACK_UNCONFIRMED)

    def test_jira_tool_creates_finds_assigns_and_lists(self):
        api = use_jira(self)
        connector = self.jira_connector()
        tool = tools.JiraTool()
        issue = tool.create(
            connector,
            fields={
                "project": {"key": "SUP"},
                "issuetype": {"id": "10001"},
                "summary": "S",
                "labels": ["revenact-b1-s2"],
            },
            project="SUP",
        )
        self.assertEqual(issue.url, f"https://acme.atlassian.net/browse/{issue.key}")
        self.assertEqual(tool.find(connector, label="revenact-b1-s2", project="SUP").key, issue.key)
        self.assertEqual(
            tool.account_for(connector, email="priya@acme.io"),
            {"id": "acc-priya", "name": "Priya Shah"},
        )
        tool.assign(connector, issue=issue.key, account_id="acc-priya", assignee_name="Priya Shah")
        self.assertEqual(tool.assignee(connector, issue=issue.key), "acc-priya")
        rows, more = tool.options(connector, "jira_projects", query="")
        self.assertEqual(([r["id"] for r in rows], more), (["SUP", "ENG"], False))
        api.refuse_next(r"project/search", 401)
        with self.assertRaises(tools.ListFailed) as caught:
            tool.options(connector, "jira_projects")
        self.assertEqual(
            (caught.exception.code, caught.exception.detail, caught.exception.status),
            ("TOOL_REFUSED", "Jira refused the login. Reconnect Jira, then try again.", 409),
        )
        api.drop_next(r"POST /rest/api/3/issue$")
        with self.assertRaises(tools.Unconfirmed):
            tool.create(
                connector,
                fields={
                    "project": {"key": "SUP"},
                    "issuetype": {"id": "10001"},
                    "summary": "S",
                    "labels": [],
                },
                project="SUP",
            )

    def test_a_missing_jira_site_or_project_is_not_found(self):
        api = use_jira(self)
        connector = self.jira_connector()
        tool = tools.JiraTool()
        api.refuse_next(r"project/search", 404)
        with self.assertRaises(tools.ListFailed) as caught:
            tool.options(connector, "jira_projects")
        self.assertEqual(
            (caught.exception.code, caught.exception.detail, caught.exception.status),
            ("TOOL_NOT_FOUND", "Jira can't find this site. Check the Jira connection.", 409),
        )
        with self.assertRaises(tools.ListFailed) as caught:
            tool.options(connector, "jira_issue_types", project="NOPE")
        self.assertEqual(caught.exception.detail, "Jira can't find the project NOPE.")

    def test_jira_tool_comments_and_finds_a_comment(self):
        api = use_jira(self)
        connector = self.jira_connector()
        tool = tools.JiraTool()
        made = tool.comment(connector, issue="SUP-12", body=adf("Seen again.", "ref b3-s9."))
        self.assertEqual(
            (made.key, made.issue_url, made.url),
            (
                "SUP-12",
                "https://acme.atlassian.net/browse/SUP-12",
                f"https://acme.atlassian.net/browse/SUP-12?focusedCommentId={made.id}",
            ),
        )
        self.assertEqual(tool.find_comment(connector, issue="SUP-12", marker="ref b3-s9"), made)
        api.refuse_next(r"comment$", 403)
        with self.assertRaises(tools.Refused) as caught:
            tool.comment(connector, issue="SUP-12", body=adf("x"))
        self.assertEqual(
            caught.exception.sentence,
            "The Jira account can't do this in SUP-12. Give it permission in Jira, then Retry.",
        )
        api.drop_next(r"POST /rest/api/3/issue/SUP-12/comment$")
        with self.assertRaises(tools.Unconfirmed) as caught:
            tool.comment(connector, issue="SUP-12", body=adf("x"))
        self.assertEqual(
            caught.exception.sentence,
            "We couldn't confirm Jira added the comment. Retry checks Jira first.",
        )


class KeyAndTrailTests(OutsideFixture):
    def test_the_key_the_window_and_the_attempt(self):
        _, thread = self.slack_thread(self.pizza)
        bundle = self.outside_bundle(thread, ("note.create", {"title": "T", "body": "B"}))
        step = bundle.steps.get()
        self.assertEqual(keys.key_for(step), f"b{bundle.pk}-s{step.pk}")
        self.assertEqual(keys.jira_label(keys.key_for(step)), f"revenact-b{bundle.pk}-s{step.pk}")
        first = keys.attempt(step, self.csm)
        step.result = first
        later = keys.attempt(step, self.admin)
        self.assertEqual(later, first)
        self.assertEqual(
            keys.since(step), datetime.fromisoformat(first["attempted_at"]) - keys.LOOKBACK
        )

    def test_the_trail_names_no_text(self):
        _, thread = self.slack_thread(self.pizza)
        bundle = self.outside_bundle(thread, ("note.create", {"title": "T", "body": "B"}))
        step = bundle.steps.get()
        trail.call(
            step,
            self.csm,
            tool="slack",
            op="post",
            outcome="ok",
            where="C0SUPPORT",
            returned="1760340001.000100",
        )
        event = AuditEvent.objects.get(action="agent_outside.call")
        self.assertEqual(
            event.metadata,
            {
                "kind": "note.create",
                "bundle": bundle.pk,
                "tool": "slack",
                "op": "post",
                "outcome": "ok",
                "where": "C0SUPPORT",
                "returned": "1760340001.000100",
                "key": f"b{bundle.pk}-s{step.pk}",
            },
        )
        self.assertEqual(event.actor, self.csm)


class AttemptKeptTests(OutsideFixture):
    def test_an_outside_step_that_breaks_keeps_its_attempt(self):
        import dataclasses

        from services.agents.registry import REGISTRY

        def explode(action, actor, **_):
            raise RuntimeError("boom")

        broken = dataclasses.replace(
            REGISTRY["note.create"], key="test.out", outside=True, irreversible=True, apply=explode
        )
        _, thread = self.slack_thread(self.pizza)
        with patch.dict(REGISTRY, {"test.out": broken}):
            bundle = self.outside_bundle(thread, ("test.out", {"title": "T", "body": "B"}))
            step = bundle.steps.get()
            self.run_all_steps(self.csm, bundle)
        step.refresh_from_db()
        self.assertEqual(step.status, "failed")
        self.assertEqual(step.error, "Something went wrong running this step. Retry it.")
        self.assertEqual(step.result["attempted_by"], self.csm.pk)
        self.assertIn("attempted_at", step.result)

    def test_each_thread_offers_its_own_outside_kinds(self):
        # D3-18: a Slack thread offers its reply; a Jira thread its own Jira
        # connector's steps; another helpdesk's ticket offers nothing outside.
        from services.agents.outside.offered import offered
        from services.connectors.models import Connector

        slack_ctx, _ = self.thread_ctx(self.slack_thread(self.pizza)[1])
        self.assertEqual(offered(slack_ctx), {"slack.reply"})
        board = self.jira_connector()
        jira_ctx, _ = self.thread_ctx(self.jira_thread(self.dough, board)[1])
        self.assertEqual(offered(jira_ctx), {"jira.create", "jira.assign", "jira.comment"})
        self.assertEqual(jira_ctx.jira_connector, {"id": board.pk, "project": "SUP"})
        Connector.objects.filter(pk=board.pk).update(is_enabled=False)
        zendesk_ctx, _ = self.thread_ctx(self.ticket_thread(self.taco)[1])
        self.assertEqual(offered(zendesk_ctx), set())

    def test_every_other_kind_on_never_still_switches_an_agent_off(self):
        from services.agents.models import AgentPolicy
        from services.agents.policy import policy_for, profiles_for
        from services.agents.registry import REGISTRY, kinds_for
        from services.agents.run import skip_reason

        AgentPolicy.objects.update_or_create(
            organisation=self.org,
            defaults={
                "levels": {"cs": {k: "never" for k in kinds_for("cs") if not REGISTRY[k].outside}}
            },
        )
        profile = profiles_for(self.org)["cs"]
        self.assertEqual(
            skip_reason(self.org, profile, policy_for(self.org), self.today), "no_actions"
        )
