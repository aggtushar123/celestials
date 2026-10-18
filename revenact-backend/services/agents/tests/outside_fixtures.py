"""Outside steps' tests' world (agent bundles D3): IntakeFixture's people and
book (Carl `self.csm` owns Pizza Hut and reports to Mona; Alice `self.admin`
is an admin with view-all and Leadership; Dana `self.other`; Erin
`self.erin` in Engineering), with the outside tools replaced by fakes,
Slack and Jira connectors that can (or can't) act, Gmail mailboxes, Slack
conversations and Jira threads, and bundles holding outside steps. Nothing is ever sent."""

from unittest.mock import patch

from services.agents.registry import REGISTRY
from services.agents.tests.intake_fixtures import QUIET_AGO, IntakeFixture
from services.agents.tests.outside_fakes import use_fakes
from services.connectors.models import Connector, SlackChannel
from services.mail.models import MailboxConnection

RUN = "/api/v1/agents/bundles/{}/run/"
RETRY = "/api/v1/agents/bundles/{}/steps/{}/retry/"


class OutsideFixture(IntakeFixture):
    def setUp(self):
        super().setUp()
        self.fakes = use_fakes(self)
        self.mail, self.slack, self.jira = self.fakes.mail, self.fakes.slack, self.fakes.jira
        credits = patch("services.agents.policy.plan_credits", return_value=3000)
        credits.start()
        self.addCleanup(credits.stop)

    def slack_connector(
        self,
        *,
        department="cs",
        channel="C0SUPPORT",
        name="support",
        can_act=True,
        channel_row=True,
    ):
        made = self.connector("slack", department=department)
        made.set_credentials({"bot_token": "xoxb-test-only"})
        made.config = {
            "channel": channel,
            "channel_name": name,
            "team_id": "T0ACME",
            "bot_name": "revenact",
            "via": "token",
        }
        made.status = Connector.Status.CONNECTED
        made.granted_scopes = (
            ["channels:history", "chat:write"] if can_act else ["channels:history"]
        )
        made.agents_can_act = can_act
        made.save()
        # What the data migration makes of a connection's channel (Slack escalations D3).
        if channel_row:
            SlackChannel.objects.create(
                connector=made, channel_id=channel, name=name, is_member=True
            )
        return made

    def jira_connector(self, *, department="engineering", project="SUP", can_act=True):
        made = self.connector("jira", department=department)
        made.set_credentials({"email": "bot@acme.io", "api_token": "test-only"})
        made.config = {"host": "acme.atlassian.net", "project": project, "account_name": "Jira Bot"}
        made.status = Connector.Status.CONNECTED
        made.granted_scopes = ["CREATE_ISSUES", "ASSIGN_ISSUES"] if can_act else []
        made.agents_can_act = can_act
        made.save()
        return made

    def link_for(
        self, user, *, host="acme.atlassian.net", status="linked", expires_in=3600, account_id=None
    ):
        """A Jira link for `user` covering `host` (round 2 D2), with fake tokens."""
        import time

        from services.connectors.models import JiraLink

        link = JiraLink(
            organisation=user.organisation,
            user=user,
            account_id=account_id or f"acc-{user.pk}",
            name=user.name,
            sites=[{"cloud_id": "cloud-1", "url": f"https://{host}", "name": host.split(".")[0]}],
            status=status,
        )
        link.set_credentials(
            {
                "access_token": f"at-{user.pk}",
                "refresh_token": "rt-0",
                "expires_at": time.time() + expires_in,
            }
        )
        link.save()
        return link

    def gmail_for(self, user):
        """`user`'s mailbox as a connected two-way Gmail, changed in place
        (threads keep their mailbox); made when they have none."""
        from services.mail.tests.gmail_fixtures import CREDENTIALS, GRANTED, google_connection

        connection = MailboxConnection.objects.filter(user=user).first()
        if connection is None:
            return google_connection(user)
        connection.provider = MailboxConnection.Provider.GOOGLE
        connection.granted_scopes = list(GRANTED)
        connection.status = MailboxConnection.Status.CONNECTED
        connection.paused_reason = ""
        connection.set_credentials(dict(CREDENTIALS))
        connection.save()
        return connection

    def slack_thread(self, record, connector=None, ts="1760339999.000100"):
        """A Slack conversation through `connector` on `record`, its thread
        touched QUIET_AGO (Slack escalations D1: Slack is never a ticket)."""
        from django.utils import timezone

        from services.agents import threads
        from services.customers.tests.slack_fixtures import conversation, msg

        connector = connector or self.slack_connector()
        made = conversation(
            record,
            connector,
            thread_ts=ts,
            channel=connector.config["channel"],
            channel_name=connector.config["channel_name"],
            title="Nobody can log in",
            messages=[msg(ts, "Ann Lee", "Nobody can log in since the password reset.")],
        )
        now = timezone.now()
        thread = threads.touch_conversation(made, now, at=now - QUIET_AGO)
        return made, thread

    def jira_thread(self, record, connector=None, key="SUP-12"):
        connector = connector or self.jira_connector()
        return self.ticket_thread(
            record,
            connector=connector,
            number=key,
            title="Export fails",
            description="Large exports time out.",
        )

    def outside_bundle(self, thread, *steps):
        """A waiting message bundle on `thread` holding (kind, payload) steps,
        each with `before` as its kind reads it now."""
        bundle = self.message_bundle(thread)
        for kind, payload in steps:
            step = self.step(thread.record, kind=kind, payload=payload, bundle=bundle)
            step.before = REGISTRY[kind].current(step)
            step.save(update_fields=["before"])
        return bundle

    @staticmethod
    def mail_payload(email, *, body="We're on it: the fix ships Friday.", to=None, cc=()):
        return {
            "email_id": email.pk,
            "mailbox_id": email.mailbox_id,
            "to": list(to or [email.from_address]),
            "cc": list(cc),
            "subject": f"Re: {email.subject}",
            "body": body,
        }

    @staticmethod
    def slack_payload(conversation, connector, *, text="We're on it: the fix ships Friday."):
        return {
            "conversation_id": conversation.pk,
            "source_connector_id": connector.pk,
            "connector_id": connector.pk,
            "channel": connector.config["channel"],
            "channel_name": connector.config["channel_name"],
            "source_channel": connector.config["channel"],
            "source_channel_name": connector.config["channel_name"],
            "thread_ts": conversation.thread_ts,
            "text": text,
        }

    @staticmethod
    def jira_payload(
        connector, *, summary="Login loop after password reset", member=None, project="SUP"
    ):
        return {
            "connector_id": connector.pk,
            "project": project,
            "issue_type": {"id": "", "name": "Task"},
            "summary": summary,
            "description": "Since Monday nobody can log in after a reset.",
            "priority": {"id": "", "name": "High"},
            "assignee": None,
            "assignee_member_id": member,
        }

    @staticmethod
    def assign_payload(connector, issue, *, member=None, account=None):
        return {
            "connector_id": connector.pk,
            "issue": issue,
            "assignee": account,
            "assignee_member_id": member,
        }

    def run_all_steps(self, user, bundle, fields=None):
        rows = []
        for step in bundle.steps.filter(status="proposed").order_by("position"):
            row = {"id": step.pk, "selected": True}
            if fields and step.pk in fields:
                row["fields"] = fields[step.pk]
            rows.append(row)
        return self.client_for(user).post(RUN.format(bundle.pk), {"steps": rows}, format="json")

    def retry(self, user, step, fields=None):
        return self.client_for(user).post(
            RETRY.format(step.bundle_id, step.pk),
            {"fields": fields} if fields else {},
            format="json",
        )
