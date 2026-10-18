"""jira.comment (agent bundles round 2 D1 contract §2, §3, R2D1-2 to R2D1-6).
Jira is a fake; nothing is posted."""

from django.test import override_settings

from core.models import AuditEvent
from services.agents import placeholders
from services.agents.actions import jira_comments
from services.agents.evidence import Context
from services.agents.kinds import Invalid
from services.agents.tests.outside_fixtures import OutsideFixture

DETAIL = "/api/v1/agents/bundles/{}/"
STEP = "/api/v1/agents/bundles/{}/steps/{}/"
OPTIONS = "/api/v1/agents/bundles/{}/steps/{}/options/{}/"
BODY = "Customer confirms the loop on Chrome too."


class JiraCommentTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        # Customer Success's Jira: Carl reads its tickets, so he reads and runs the bundle.
        self.board = self.jira_connector(department="cs")
        self.ticket, self.thread = self.jira_thread(self.pizza, self.board, key="SUP-12")

    @staticmethod
    def comment_payload(connector, issue="SUP-12", body=BODY):
        return {"connector_id": connector.pk, "issue": issue, "body": body}

    def one_step(self, **kw):
        bundle = self.outside_bundle(
            self.thread, ("jira.comment", self.comment_payload(self.board, **kw))
        )
        return bundle, bundle.steps.get()

    def ctx(self, thread_id=1):
        ctx = Context(self.org, "cs", self.today)
        ctx.thread_id = thread_id
        ctx.jira_connector = {"id": self.board.pk, "project": "SUP"}
        ctx.thread_ticket = {
            "id": self.ticket.pk,
            "record": f"customer:{self.pizza.pk}",
            "line": "",
            "provider": "jira",
            "connector_id": self.board.pk,
            "external_id": "SUP-12",
            "number": "SUP-12",
            "config": self.board.config,
            "usable": True,
        }
        return ctx

    def test_the_source_issue_or_an_earlier_steps_never_at_night(self):
        row = {"ref": f"customer:{self.pizza.pk}"}
        self.assertEqual(
            jira_comments.validate({"issue": "source", "body": BODY}, row, self.ctx(), []),
            {"connector_id": self.board.pk, "issue": "SUP-12", "body": BODY},
        )
        self.assertEqual(
            jira_comments.validate(
                {"issue": "{{step 1.ticket_key}}", "body": BODY}, row, self.ctx(), []
            )["issue"],
            "{{step 1.ticket_key}}",
        )
        for bad, ctx in (
            ({"issue": "ENG-9", "body": BODY}, self.ctx()),
            ({"issue": "source", "body": ""}, self.ctx()),
            ({"issue": "source", "body": "x" * 2001}, self.ctx()),
            ({"issue": "source", "body": BODY}, self.ctx(thread_id=None)),
        ):
            with self.subTest(bad=bad, thread=ctx.thread_id), self.assertRaises(Invalid):
                jira_comments.validate(bad, row, ctx, [])

    def test_a_run_posts_the_body_and_its_ref(self):
        bundle, step = self.one_step()
        self.run_all_steps(self.csm, bundle)
        step.refresh_from_db()
        self.assertEqual(step.status, "applied", step.error)
        [comment] = self.jira.comments
        self.assertEqual(comment["issue"], "SUP-12")
        self.assertIn(BODY, comment["text"])
        self.assertIn(
            f"Posted by {self.csm.name} from Revenact · ref b{bundle.pk}-s{step.pk}.",
            comment["text"],
        )
        url = f"https://acme.atlassian.net/browse/SUP-12?focusedCommentId={comment['id']}"
        self.assertEqual(
            step.outputs,
            {
                "ticket_key": "SUP-12",
                "ticket_url": "https://acme.atlassian.net/browse/SUP-12",
                "comment_url": url,
            },
        )
        detail = self.client_for(self.csm).get(DETAIL.format(bundle.pk)).json()
        self.assertEqual(
            detail["steps"][0]["links"],
            [{"label": "Open the comment on SUP-12 in Jira", "url": url, "external": True}],
        )

    # Linking off whatever the developer's .env says: the preview reads "off".
    @override_settings(ATLASSIAN_OAUTH_CLIENT_ID="", ATLASSIAN_OAUTH_CLIENT_SECRET="")
    def test_the_preview_says_where_and_as_whom(self):
        bundle, _ = self.one_step()
        detail = self.client_for(self.csm).get(DETAIL.format(bundle.pk)).json()
        self.assertEqual(
            detail["steps"][0]["preview"],
            {
                "jira_comment": {
                    "site": "acme.atlassian.net",
                    "issue": "SUP-12",
                    "excerpt": BODY,
                    "as": "Jira Bot",
                    "as_you": False,
                    "link": "off",
                    "internal": True,
                }
            },
        )
        self.assertEqual(detail["steps"][0]["editable"], ["body"])

    def test_a_lost_answer_is_found_on_retry_and_never_posted_twice(self):
        self.jira.drop_next("comment")
        bundle, step = self.one_step()
        self.run_all_steps(self.csm, bundle)
        step.refresh_from_db()
        self.assertEqual(
            (step.status, step.error),
            ("failed", "We couldn't confirm Jira added the comment. Retry checks Jira first."),
        )
        self.retry(self.csm, step)
        step.refresh_from_db()
        self.assertEqual((step.status, len(self.jira.comments)), ("applied", 1))
        self.assertEqual(self.jira.comment_lookups, [("SUP-12", f"ref b{bundle.pk}-s{step.pk}")])
        calls = list(
            AuditEvent.objects.filter(action="agent_outside.call")
            .order_by("created_at", "pk")
            .values_list("metadata__op", "metadata__outcome", "metadata__where")
        )
        self.assertEqual(
            calls, [("comment", "unconfirmed", "SUP-12"), ("lookup", "found", "SUP-12")]
        )

    def test_the_trail_holds_ids_only(self):
        bundle, _ = self.one_step()
        self.run_all_steps(self.csm, bundle)
        [row] = AuditEvent.objects.filter(action="agent_outside.call", metadata__op="comment")
        self.assertEqual(
            (row.metadata["where"], row.metadata["returned"]),
            ("SUP-12", self.jira.comments[0]["id"]),
        )
        self.assertNotIn("Chrome", str(row.metadata))

    def test_a_refusal_is_the_steps_sentence(self):
        sentence = (
            "The Jira account can't do this in SUP-12. Give it permission in Jira, then Retry."
        )
        self.jira.refuse_next("comment", sentence)
        bundle, step = self.one_step()
        self.run_all_steps(self.csm, bundle)
        step.refresh_from_db()
        self.assertEqual((step.status, step.error), ("failed", sentence))

    def test_it_comments_on_the_issue_an_earlier_step_made(self):
        bundle = self.outside_bundle(
            self.thread,
            ("jira.create", self.jira_payload(self.board)),
            (
                "jira.comment",
                self.comment_payload(
                    self.board,
                    issue="{{step 1.ticket_key}}",
                    body="Tracked at {{step 1.ticket_url}}",
                ),
            ),
        )
        detail = self.client_for(self.csm).get(DETAIL.format(bundle.pk)).json()
        labels = {p["field"]: p["label"] for p in detail["steps"][1]["placeholders"]}
        self.assertEqual(labels, {"issue": "Jira key from step 1", "body": "Jira link from step 1"})
        self.run_all_steps(self.csm, bundle)
        [made] = self.jira.created
        [comment] = self.jira.comments
        self.assertEqual(comment["issue"], made)
        self.assertIn(f"Tracked at https://acme.atlassian.net/browse/{made}", comment["text"])

    def test_it_needs_its_issue_to_have_been_made(self):
        self.jira.refuse_next("create", "Jira says the project SUP needs a component.")
        bundle = self.outside_bundle(
            self.thread,
            ("jira.create", self.jira_payload(self.board)),
            ("jira.comment", self.comment_payload(self.board, issue="{{step 1.ticket_key}}")),
        )
        self.run_all_steps(self.csm, bundle)
        step = bundle.steps.get(position=2)
        self.assertEqual((step.status, step.error), ("failed", "Needs step 1, which didn't run."))
        self.assertEqual(self.jira.comments, [])

    def test_edits(self):
        bundle, step = self.one_step()
        url = STEP.format(bundle.pk, step.pk)
        client = self.client_for(self.csm)
        blank = client.patch(url, {"fields": {"body": ""}}, format="json")
        self.assertEqual(blank.json()["steps"][str(step.pk)], {"body": ["Write the comment."]})
        long = client.patch(url, {"fields": {"body": "x" * 4001}}, format="json")
        self.assertEqual(
            long.json()["steps"][str(step.pk)],
            {"body": ["Keep the comment under 4000 characters."]},
        )
        done = client.patch(url, {"fields": {"body": "Seen on Safari."}}, format="json")
        self.assertEqual(done.status_code, 200, done.content)
        step.refresh_from_db()
        self.assertEqual(step.payload["body"], "Seen on Safari.")

    def test_a_read_only_jira_disables_it(self):
        self.board.agents_can_act = False
        self.board.save(update_fields=["agents_can_act"])
        bundle, _ = self.one_step()
        detail = self.client_for(self.csm).get(DETAIL.format(bundle.pk)).json()
        step = detail["steps"][0]
        self.assertEqual(
            (step["can_run"], step["disabled_reason"], step["disabled_link"]),
            (False, "Ask an admin to allow agents to act in Jira.", "/settings/connections"),
        )

    def test_it_cant_be_undone(self):
        bundle, step = self.one_step()
        self.run_all_steps(self.csm, bundle)
        undo = self.client_for(self.csm).post(f"/api/v1/agents/actions/{step.pk}/undo/")
        self.assertEqual(undo.json()["detail"], "This Jira comment has been posted.")

    def test_its_link_chip(self):
        self.assertEqual(placeholders.label(1, "comment_url"), "Jira comment link from step 1")
        self.assertEqual(
            placeholders.outputs_for(
                {"comment_url": "https://acme.atlassian.net/browse/SUP-1?focusedCommentId=9"}
            ),
            {"comment_url": "https://acme.atlassian.net/browse/SUP-1?focusedCommentId=9"},
        )

    def test_it_has_no_pick_list(self):
        bundle, step = self.one_step()
        answer = self.client_for(self.csm).get(OPTIONS.format(bundle.pk, step.pk, "jira_assignees"))
        self.assertEqual(
            (answer.status_code, answer.json()),
            (400, {"list": ["This step has no such list."]}),
        )
