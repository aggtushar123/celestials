"""End-to-end tier: real server, real HTTP, real test DB; Slack, Jira, Graph
and Gmail are fakes (their APIs in memory), the model is a fake. Nothing
leaves the process.

Journey 1 (round 2 D1, jira.comment and N1): Alice connects Slack and Jira.
A customer's Slack message is synced and read by the agents, who propose a
Slack reply, a Jira issue and an internal comment on it. Jira's project list
answers 404 for a moment: the pick list says Jira can't find the site, not
that it is unreachable. While Jira is in error it asks for a reconnect.
Carl edits the comment. Alice lets agents act in Jira. Carl runs the Jira
steps only; Jira's answer to the comment is lost, the step fails "couldn't
confirm", and his Retry finds the comment by its ref and posts nothing more.
The comment is internal and ends with who ran it and its ref. History links
to the issue and the comment.

Journey 2 (Outlook): Carl's mailbox is Outlook. He writes a signature in
Revenact. The agents propose a reply to a customer's email; Carl runs it:
it goes through Graph's reply (threaded), carries the step's stamp and ends
with his signature. He then answers from Communications himself: threaded
and signed the same way.

Journey 3 (Gmail): Dana's signature is Gmail's, so Revenact won't change
it; a draft she edits keeps the signature block whole."""

import secrets
from datetime import timedelta
from unittest.mock import patch

from django.test import LiveServerTestCase
from django.utils import timezone

from core.models import AuditEvent
from e2e.agent_round2_world import Round2World
from e2e.http import http_get, http_patch, http_post
from services.accounts.models import Organisation, User
from services.agents import threads
from services.agents.models import SignalThread
from services.billing.models import BillingAccount
from services.connectors.models import Connector
from services.customers.models import Email
from services.identity.models import OrganizationDomain
from services.mail import send_as
from services.mail.models import MailDraft, MailMessage
from services.mail.providers.microsoft import STAMP_GUID
from services.mail.tests.gmail_fake import FakeGmail
from services.mail.tests.gmail_fixtures import google_connection
from services.mail.tests.graph_fake import outlook_connection, use_graph

STAMP = f"String {{{STAMP_GUID}}} Name x-revenact-step"
#: Made at import: no credential-looking literal in the code (CI's semgrep).
PASSWORD = secrets.token_urlsafe(18)


class AgentRound2FlowTests(Round2World, LiveServerTestCase):
    def setUp(self):
        self.use_world_fakes()
        self.graph = use_graph(self)

    def jira_agents(self, token, connector_id):
        status, rows = http_get(self.api("/connectors/"), token)
        self.assertEqual(status, 200, rows)
        return next(row for row in rows if row["id"] == connector_id)["agents"]

    def test_a_jira_comment_is_found_again_and_a_404_is_not_found(self):
        alice, carl, pizza = self.workspace()
        org = carl.organisation
        slack, jira, body = self.connect_slack_and_jira(alice)
        self.assertEqual(body["agents"]["kinds"], ["jira.create", "jira.assign", "jira.comment"])
        self.assertEqual(body["agents"]["needs"], "permission")

        # The Slack message is synced and read: a reply, an issue, a comment on it.
        status, _ = http_post(self.api(f"/connectors/{slack['id']}/sync/"), {}, token=alice)
        self.assertEqual(status, 200)
        thread = SignalThread.objects.get()
        bundle = self.read_thread(
            org,
            thread,
            "message ",
            [
                {
                    "kind": "slack.reply",
                    "title": "Tell Ann we're on it",
                    "rationale": "She is locked out.",
                    "payload": {"text": "Thanks Ann, we're on it."},
                },
                {
                    "kind": "jira.create",
                    "title": "Log the login loop",
                    "rationale": "Engineering must fix it.",
                    "payload": {
                        "summary": "Login loop after password reset",
                        "description": "Nobody can log in since the reset.",
                        "priority": "high",
                        "assignee_id": None,
                    },
                },
                {
                    "kind": "jira.comment",
                    "title": "Note where it came from",
                    "rationale": "Engineering should know it came from Slack.",
                    "payload": {
                        "issue": "{{step 2.ticket_key}}",
                        "body": "Reported in the customer's Slack support channel.",
                    },
                },
            ],
        )
        carl_token = self.login("carl@acme.io")
        status, detail = http_get(self.api(f"/agents/bundles/{bundle.pk}/"), carl_token)
        self.assertEqual(status, 200, detail)
        # A Slack thread's issue is an escalation (Slack escalations D4): the
        # platform adds the assignment and the to-do, and the reply runs last;
        # the comment's placeholder follows the issue to step 1.
        self.assertEqual(
            [s["kind"] for s in detail["steps"]],
            ["jira.create", "jira.assign", "task.create", "jira.comment", "slack.reply"],
        )
        create, comment = detail["steps"][0], detail["steps"][3]
        self.assertEqual(
            comment["preview"]["jira_comment"],
            {
                "site": "acme.atlassian.net",
                "issue": "{{step 1.ticket_key}}",
                "excerpt": "Reported in the customer's Slack support channel.",
                "as": "Jira Bot",
                "as_you": False,
                "link": "off",
                "internal": True,
            },
        )
        self.assertEqual(
            (comment["outside"], comment["irreversible"], comment["editable"]),
            (True, True, ["body"]),
        )

        # Jira's project list answers 404: the list says so, not "couldn't reach".
        self.jira.refuse_next(r"GET /rest/api/3/project/search", 404)
        status, body = http_get(
            self.api(f"/agents/bundles/{bundle.pk}/steps/{create['id']}/options/jira_projects/"),
            carl_token,
        )
        self.assertEqual(
            (status, body),
            (
                409,
                {
                    "code": "TOOL_NOT_FOUND",
                    "detail": "Jira can't find this site. Check the Jira connection.",
                },
            ),
        )

        # Jira in error asks for a reconnect before any permission.
        Connector.objects.filter(pk=jira["id"]).update(status=Connector.Status.ERROR)
        agents = self.jira_agents(alice, jira["id"])
        self.assertEqual((agents["can_act"], agents["needs"]), (False, "reconnect"))
        Connector.objects.filter(pk=jira["id"]).update(status=Connector.Status.CONNECTED)
        self.assertEqual(self.jira_agents(alice, jira["id"])["needs"], "permission")

        # Carl edits the comment: blank is refused, then a new body is kept.
        step_url = self.api(f"/agents/bundles/{bundle.pk}/steps/{comment['id']}/")
        status, body = http_patch(step_url, {"fields": {"body": "  "}}, carl_token)
        self.assertEqual(
            (status, body), (400, {"steps": {str(comment["id"]): {"body": ["Write the comment."]}}})
        )
        edited = "Reported in Slack: Ann is locked out since the reset."
        status, body = http_patch(step_url, {"fields": {"body": edited}}, carl_token)
        self.assertEqual(status, 200, body)
        self.assertEqual(body["bundle"]["steps"][3]["preview"]["jira_comment"]["excerpt"], edited)

        # Alice lets agents act in Jira; Carl runs the Jira steps; the comment's answer is lost.
        status, body = http_post(
            self.api(f"/connectors/{jira['id']}/agents/"), {"can_act": True}, token=alice
        )
        self.assertEqual((status, body["agents"]["can_act"]), (200, True))
        self.assertIsNone(body["agents"]["needs"])
        self.jira.drop_next(r"POST /rest/api/3/issue/[A-Z0-9_]+-\d+/comment$")
        chosen = ("jira.create", "jira.comment")
        rows = [{"id": s["id"], "selected": s["kind"] in chosen} for s in detail["steps"]]
        status, body = http_post(
            self.api(f"/agents/bundles/{bundle.pk}/run/"), {"steps": rows}, token=carl_token
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(
            [(s["status"], s["error"]) for s in body["bundle"]["steps"]],
            [
                ("applied", ""),
                ("skipped", ""),
                ("skipped", ""),
                ("failed", "We couldn't confirm Jira added the comment. Retry checks Jira first."),
                ("skipped", ""),
            ],
        )
        [key] = self.jira.created
        self.assertEqual(len(self.jira.comments[key]), 1)

        # Retry finds the comment by its ref: none posted twice.
        status, body = http_post(
            self.api(f"/agents/bundles/{bundle.pk}/steps/{comment['id']}/retry/"),
            {},
            token=carl_token,
        )
        self.assertEqual(status, 200, body)
        # The other steps were left out (skipped): every selected step ran.
        self.assertEqual(body["bundle"]["status"], "done")
        self.assertEqual(self.slack.posts(), [])
        [posted] = self.jira.comments[key]
        self.assertEqual(
            posted["properties"], [{"key": "sd.public.comment", "value": {"internal": True}}]
        )
        paragraphs = [
            "".join(part["text"] for part in block["content"])
            for block in posted["body"]["content"]
        ]
        self.assertEqual(
            paragraphs,
            [edited, f"Posted by Carl CSM from Revenact · ref b{bundle.pk}-s{comment['id']}."],
        )

        # History links to the issue and to the comment; the calls are audited.
        status, history = http_get(self.api("/agents/bundles/history/"), carl_token)
        links = [link for step in history["results"][0]["steps"] for link in step["links"]]
        self.assertEqual(
            [link["label"] for link in links],
            [f"Open {key} in Jira", f"Open the comment on {key} in Jira"],
        )
        self.assertEqual(
            (links[1]["url"], links[1]["external"]),
            (f"https://acme.atlassian.net/browse/{key}?focusedCommentId={posted['id']}", True),
        )
        calls = list(
            AuditEvent.objects.filter(action="agent_outside.call").values_list(
                "metadata__op", "metadata__outcome"
            )
        )
        self.assertIn(("comment", "unconfirmed"), calls)
        self.assertIn(("lookup", "found"), calls)
        self.assertNotIn(("comment", "ok"), calls)
        self.assertEqual(pizza.pk, thread.customer_id)

    def test_an_outlook_reply_is_signed_and_threaded(self):
        _, carl, pizza = self.workspace()
        connection = outlook_connection(carl)
        email = Email.objects.create(
            customer=pizza,
            subject="Login loop",
            sender_name="Ann Lee",
            recipient_name=carl.name,
            body="We can't log in.",
            sent_at=timezone.now() - timedelta(hours=1),
            mailbox=connection,
            mailbox_owner=carl,
            direction=Email.Direction.RECEIVED,
            from_address="ann@pizzahut.com",
            to_addresses=[connection.address],
            thread_id="conv-1",
            provider_message_id="graph-orig",
        )
        MailMessage.objects.create(
            connection=connection,
            owner=carl,
            organisation=carl.organisation,
            provider_message_id="graph-orig",
            direction=MailMessage.Direction.RECEIVED,
            from_address="ann@pizzahut.com",
            subject="Login loop",
            sent_at=email.sent_at,
            rfc_message_id="<m1@pizzahut.com>",
            thread_id="conv-1",
            email=email,
        )
        self.graph.held["<m1@pizzahut.com>"] = ("graph-orig", "conv-1")
        token = self.login("carl@acme.io")
        status, body = http_patch(
            self.api("/mail/connection/"), {"signature": "Carl CSM\nAcme  \n\n"}, token
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(
            body["connection"]["signature"],
            {"text": "Carl CSM\nAcme", "editable": True, "source": "revenact"},
        )

        # The agents propose a reply; Carl runs it: Graph's reply, stamped and signed.
        bundle = self.read_thread(
            carl.organisation,
            threads.touch_mail(email),
            "email ",
            [
                {
                    "kind": "mail.send_reply",
                    "title": "Answer Ann",
                    "rationale": "She is locked out.",
                    "payload": {"body": "We're on it, Ann."},
                }
            ],
        )
        status, detail = http_get(self.api(f"/agents/bundles/{bundle.pk}/"), token)
        [step] = detail["steps"]
        self.assertEqual(
            (step["kind"], step["preview"]["mail"]["threaded"]), ("mail.send_reply", True)
        )
        status, body = http_post(
            self.api(f"/agents/bundles/{bundle.pk}/run/"),
            {"steps": [{"id": step["id"], "selected": True}]},
            token=token,
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(body["bundle"]["steps"][0]["status"], "applied", body)
        [agent] = self.graph.replies
        self.assertEqual(agent["id"], "graph-orig")
        self.assertNotIn("toRecipients", agent["message"])
        self.assertEqual(
            agent["message"]["body"]["content"], "We're on it, Ann.\n\n-- \nCarl CSM\nAcme"
        )
        self.assertEqual(
            agent["message"]["singleValueExtendedProperties"],
            [{"id": STAMP, "value": f"b{bundle.pk}-s{step['id']}"}],
        )

        # His own reply from Communications threads and is signed too, unstamped.
        status, body = http_post(
            self.api(f"/communications/emails/{email.pk}/reply/"),
            {"body": "Thanks Ann."},
            token=token,
        )
        self.assertEqual(status, 201, body)
        _, reply = self.graph.replies
        self.assertEqual(reply["id"], "graph-orig")
        self.assertEqual(reply["message"]["body"]["content"], "Thanks Ann.\n\n-- \nCarl CSM\nAcme")
        self.assertNotIn("singleValueExtendedProperties", reply["message"])
        self.assertEqual(self.graph.posted, [])

    def test_a_gmail_signature_stays_gmails_and_survives_an_edit(self):
        org = Organisation.objects.create(name="Dough Co", gmail_two_way_enabled=True)
        BillingAccount.objects.filter(organisation=org).update(seats_limit=10)
        OrganizationDomain.objects.create(
            organisation=org, domain="acme.io", verification_status="verified"
        )
        dana = User.objects.create_user(
            email="dana@acme.io", password=PASSWORD, name="Dana Ruiz", organisation=org
        )
        rich = '<div>Dana Ruiz<br><img src="https://dough.co/logo.png" alt="Dough Co"></div>'
        mailbox = google_connection(
            dana,
            send_as_name="Dana Ruiz",
            signature_html=rich,
            send_as_synced_at=timezone.now(),
        )
        fake = FakeGmail("dana@acme.io")
        gmail = patch("services.mail.providers.google.http_json", fake)
        gmail.start()
        self.addCleanup(gmail.stop)
        token = self.login("dana@acme.io", PASSWORD)

        status, body = http_patch(self.api("/mail/connection/"), {"signature": "Dana"}, token)
        self.assertEqual(
            (status, body),
            (
                409,
                {
                    "code": "SIGNATURE_IN_GMAIL",
                    "detail": "Change your signature in Gmail. Revenact uses it from there.",
                },
            ),
        )

        # The editor hands back the block reduced to text: the whole block is put back.
        status, draft = http_post(
            self.api("/mail/drafts/"),
            {"kind": "new", "to": [["Ann Lee", "ann@pizzahut.com"]], "html": "<p>Hi</p>"},
            token=token,
        )
        self.assertEqual(status, 201, draft)
        status, body = http_patch(
            self.api(f"/mail/drafts/{draft['id']}/"),
            {
                "html": '<p>Two years.</p><div data-revenact-signature="">Dana Ruiz</div>',
                "revision": draft["revision"],
            },
            token,
        )
        self.assertEqual(status, 200, body)
        stored = MailDraft.objects.get(pk=draft["id"]).html
        self.assertEqual(stored, "<p>Two years.</p>" + send_as.signature_block(mailbox))
        self.assertIn('src="https://dough.co/logo.png"', stored)
