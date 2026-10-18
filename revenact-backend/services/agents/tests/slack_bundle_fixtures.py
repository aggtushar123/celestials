"""Slack bundles' tests' world (owner, 2026-10-17): OutsideFixture's people,
book, fakes and connectors (Carl `self.csm` owns Pizza Hut and reports to
Mona; Alice `self.admin` is an admin with view-all; Dana `self.other`; Lee
`self.lee` is Leadership without view-all), plus Slack messages sent to Work
(`SlackSuggestion` rows) and the bundles made from them. Nothing leaves the
process; the model is always patched."""

import json
from unittest.mock import patch

from services.agents.models import AgentBundle
from services.agents.registry import REGISTRY
from services.agents.tests.outside_fixtures import OutsideFixture
from services.customers.models import Account
from services.work.models import SlackSuggestion

#: Where the proposer's one model call is patched.
MODEL = "services.agents.slack_bundles.get_completion"
BUNDLE = "/api/v1/agents/bundles/{}/"
FEED = "/api/v1/work/feed/"


class SlackBundleFixture(OutsideFixture):
    _messages = 0

    def slack_row(self, owner, record, *, channel="C0SUPPORT", **fields):
        """A Slack message `owner` sent to their Work, about `record` (None: no record)."""
        SlackBundleFixture._messages += 1
        on = {}
        if isinstance(record, Account):
            on = {"account": record, "customer": record.customers.order_by("pk").first()}
        elif record is not None:
            on = {"customer": record}
        defaults = {
            "summary": "Pizza Hut's SSO fails after 2.4.",
            "text": "Pizza Hut says SSO is failing again since this morning.",
            "sender_name": "Faiz Jamal",
            "sender_slack_id": "U0FAIZ",
            "team_id": "T0ACME",
            "channel": channel,
            "message_ts": f"1760400000.{SlackBundleFixture._messages:06d}",
            "permalink": "https://slack.com/archives/C0SUPPORT/p1760400000000100",
            "jira_summary": "Pizza Hut: SSO fails after the 2.4 release",
            "jira_description": "Admins are locked out.",
            "reply_draft": "Thanks Faiz, looking now.",
            "reply_with_issue": "Thanks Faiz, logged as {issue}.",
        }
        return SlackSuggestion.objects.create(
            organisation=self.org, owner=owner, **on, **{**defaults, **fields}
        )

    def slack_bundle(self, row, *steps, agent="cs", status="waiting"):
        """A waiting Slack bundle for `row` (its sender's), holding (kind, payload) steps."""
        record = row.record
        on = {"account": record} if isinstance(record, Account) else {"customer": record}
        bundle = AgentBundle.objects.create(
            organisation=self.org,
            agent=agent,
            title="Log it in Jira and reply",
            reason="The sender reports SSO failing.",
            source=AgentBundle.Source.SLACK_MESSAGE,
            routed_to=AgentBundle.RoutedTo.PERSON,
            routed_user=row.owner,
            slack_suggestion=row,
            status=status,
            **on,
        )
        for kind, payload in steps or [("task.create", self.task_payload())]:
            step = self.step(record, kind=kind, payload=payload, bundle=bundle, agent=agent)
            step.before = REGISTRY[kind].current(step)
            step.save(update_fields=["before"])
        return bundle

    def task_payload(self, title="Check the SSO settings"):
        return {
            "title": title,
            "assignee_id": None,
            "assignee_name": "",
            "due_date": (self.today.replace(year=self.today.year + 1)).isoformat(),
            "priority": "high",
        }

    def message_payload(self, row, connector, *, text="Thanks Faiz, on it."):
        """A slack.reply payload answering `row` (contract: `slack_message_id`)."""
        direct = row.channel.startswith("D")
        return {
            "slack_message_id": row.pk,
            "source_connector_id": connector.pk,
            "connector_id": connector.pk,
            "channel": row.channel,
            "channel_name": "",
            "source_channel": row.channel,
            "source_channel_name": "",
            "thread_ts": "" if direct else row.message_ts,
            "direct": direct,
            "text": text,
        }

    def model_answer(self, answer):
        """The proposer's model answers `answer` (a dict) for the rest of the test."""
        model = patch(MODEL, return_value=json.dumps(answer))
        found = model.start()
        self.addCleanup(model.stop)
        return found
