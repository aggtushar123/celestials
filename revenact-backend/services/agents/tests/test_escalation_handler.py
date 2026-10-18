"""Slack escalations D4, SE4-12, SE4-13 (spec §5.5): the bundle says who
has the escalation and where that came from (the thread's decision, or the
account team); Change picks any active member, or whoever handles a
department, and rewrites the assignment, the to-do and (while it is the
template) the reply, as an edit, audited."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from core.models import AuditEvent
from services.accounts.models import User
from services.agents.models import AgentBundle
from services.agents.tests.outside_fixtures import OutsideFixture
from services.knowledge.models import FunctionHead, FunctionOwner
from services.segments.tests.fixtures import person

DETAIL = "/api/v1/agents/bundles/{}/"
HANDLER = "/api/v1/agents/bundles/{}/handler/"
TEMPLATE = (
    "Thanks Faiz. Logged as {{step 1.ticket_key}} ({{step 1.ticket_url}})"
    " with Erin Eng (Engineering)."
)


class HandlerTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector(department="cs")
        self.support = self.slack_connector()
        self.conversation, self.thread = self.slack_thread(self.pizza, self.support)
        self.ivy = person("ivy@acme.io", "Ivy Eng", self.org, function=User.Function.ENGINEERING)
        # Ivy is on Pizza Hut's account team, so she may open it;
        # the fixture's Sam (Sales) may not (SE4-4).
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.ivy)
        reply = {
            **self.slack_payload(self.conversation, self.support, text=TEMPLATE),
            "escalation": True,
            "external_shared": False,
        }
        self.bundle = self.outside_bundle(
            self.thread,
            ("jira.create", self.jira_payload(self.board)),
            (
                "jira.assign",
                {
                    **self.assign_payload(self.board, "{{step 1.ticket_key}}", member=self.erin.pk),
                    "if_found": True,
                    "escalation": True,
                },
            ),
            (
                "task.create",
                {
                    "title": "Pizza Hut: CSV exports fail",
                    "assignee_id": self.erin.pk,
                    "assignee_name": "Erin Eng",
                    "due_date": self.today.isoformat(),
                    "priority": "high",
                },
            ),
            ("slack.reply", reply),
        )
        AgentBundle.objects.filter(pk=self.bundle.pk).update(
            escalation={
                "function": "engineering",
                "user_id": self.erin.pk,
                "via": "thread",
                "issue": 1,
                "shared": False,
                "first": "Faiz",
                "decision": {
                    "by": "Carl Lee",
                    "by_id": self.csm.pk,
                    "quote": "Erin, can you take this?",
                    "named": "Erin",
                    "ts": "1760340099.000100",
                },
                "reply": TEMPLATE,
            }
        )

    def patch(self, user, body):
        return self.client_for(user).patch(HANDLER.format(self.bundle.pk), body, format="json")

    def test_the_bundle_says_who_has_it_and_where_that_came_from(self):
        body = self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()
        self.assertEqual(
            body["escalation"],
            {
                "function": "engineering",
                "function_label": "Engineering",
                "handler": {
                    "id": self.erin.pk,
                    "name": "Erin Eng",
                    "function_label": "Engineering",
                },
                "via": "thread",
                "decision": {
                    "by": "Carl Lee",
                    "quote": "Erin, can you take this?",
                    "named": "Erin",
                },
                "can_change": True,
            },
        )

    def test_someone_who_may_not_decide_the_steps_can_t_change(self):
        from unittest.mock import patch

        assign = self.bundle.steps.get(kind="jira.assign")

        def only_not(reader, step):
            return step.pk != assign.pk

        with (
            patch("services.agents.deciding.may_decide", only_not),
            patch("services.agents.bundle_payloads.may_decide", only_not),
        ):
            body = self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()
            answer = self.patch(self.csm, {"user_id": self.ivy.pk})
        self.assertFalse(body["escalation"]["can_change"])
        self.assertEqual(
            (answer.status_code, answer.json()),
            (403, {"code": "CANT_RUN_STEP", "detail": "You can't run step 2.", "step": assign.pk}),
        )

    def test_a_bundle_that_does_not_wait_can_t_change(self):
        AgentBundle.objects.filter(pk=self.bundle.pk).update(status="rejected")
        body = self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()
        self.assertFalse(body["escalation"]["can_change"])

    def test_the_block_reads_the_person_without_a_query_of_its_own(self):
        """F16: the handler's name and department come with the page's people read."""
        client = self.client_for(self.csm)
        client.get(DETAIL.format(self.bundle.pk))
        with CaptureQueriesContext(connection) as escalated:
            client.get(DETAIL.format(self.bundle.pk))
        AgentBundle.objects.filter(pk=self.bundle.pk).update(escalation={})
        with CaptureQueriesContext(connection) as plain:
            client.get(DETAIL.format(self.bundle.pk))
        self.assertEqual(len(escalated), len(plain))

    def test_any_other_bundle_has_none(self):
        AgentBundle.objects.filter(pk=self.bundle.pk).update(escalation={})
        self.assertIsNone(
            self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()["escalation"]
        )

    def test_change_rewrites_both_steps_and_the_template_reply(self):
        answer = self.patch(self.csm, {"user_id": self.ivy.pk})
        self.assertEqual(answer.status_code, 200, answer.content)
        steps = {s.kind: s for s in self.bundle.steps.all()}
        self.assertEqual(
            (
                steps["jira.assign"].payload["assignee_member_id"],
                steps["jira.assign"].payload["assignee"],
            ),
            (self.ivy.pk, None),
        )
        self.assertEqual(
            (
                steps["task.create"].payload["assignee_id"],
                steps["task.create"].payload["assignee_name"],
            ),
            (self.ivy.pk, "Ivy Eng"),
        )
        self.assertEqual(
            steps["slack.reply"].payload["text"], TEMPLATE.replace("Erin Eng", "Ivy Eng")
        )
        self.assertIsNotNone(steps["jira.assign"].edited_at)
        bundle = AgentBundle.objects.get(pk=self.bundle.pk)
        self.assertEqual(
            (
                bundle.escalation["user_id"],
                bundle.escalation["via"],
                bundle.escalation["changed"],
                bundle.edited_by_id,
            ),
            (self.ivy.pk, "chosen", True, self.csm.pk),
        )
        block = answer.json()["bundle"]["escalation"]
        self.assertEqual(
            block["handler"],
            {"id": self.ivy.pk, "name": "Ivy Eng", "function_label": "Engineering"},
        )
        self.assertNotIn("changed", block)
        # where the work was first given stays on the block
        self.assertEqual(block["decision"]["named"], "Erin")
        event = AuditEvent.objects.get(action="agent_bundle.handler_changed")
        self.assertEqual(
            event.metadata,
            {"function": "engineering", "from": self.erin.pk, "to": self.ivy.pk, "via": "chosen"},
        )

    def test_a_reply_someone_wrote_is_left_alone(self):
        reply = self.bundle.steps.get(kind="slack.reply")
        reply.payload = {
            **reply.payload,
            "text": "Thanks Faiz, Erin is on it: {{step 1.ticket_key}}.",
        }
        reply.save(update_fields=["payload"])
        self.patch(self.csm, {"user_id": self.ivy.pk})
        reply.refresh_from_db()
        self.assertEqual(
            reply.payload["text"], "Thanks Faiz, Erin is on it: {{step 1.ticket_key}}."
        )
        self.assertEqual(AgentBundle.objects.get(pk=self.bundle.pk).escalation["reply"], "")

    def test_whoever_handles_it_asks_handler_for_again(self):
        """CC-8: a department Change's `via` is handler_for's: team, head or nobody."""
        cases = (("team", self.ivy.pk), ("head", self.ivy.pk), ("nobody", None))
        for via, user_id in cases:
            with self.subTest(via=via):
                if via == "head":
                    FunctionOwner.objects.filter(customer=self.pizza).delete()
                    FunctionHead(
                        organisation=self.org, function="engineering", user=self.ivy
                    ).save()
                if via == "nobody":
                    FunctionHead.objects.filter(organisation=self.org).delete()
                answer = self.patch(self.csm, {"function": "engineering", "user_id": None})
                self.assertEqual(answer.status_code, 200, answer.content)
                stored = AgentBundle.objects.get(pk=self.bundle.pk).escalation
                self.assertEqual(
                    (stored["via"], stored["user_id"], stored["function"], stored["changed"]),
                    (via, user_id, "engineering", True),
                )
                self.assertEqual(answer.json()["bundle"]["escalation"]["via"], via)
        assign = self.bundle.steps.get(kind="jira.assign")
        self.assertIsNone(assign.payload["assignee_member_id"])
        self.assertEqual(answer.json()["bundle"]["escalation"]["handler"], None)

    def test_a_department_change_moves_the_function(self):
        FunctionOwner.objects.create(customer=self.pizza, function="sales", user=self.sam)
        answer = self.patch(self.csm, {"function": "sales", "user_id": None})
        self.assertEqual(answer.status_code, 200, answer.content)
        block = answer.json()["bundle"]["escalation"]
        self.assertEqual(
            (block["function"], block["function_label"], block["via"], block["handler"]["id"]),
            ("sales", "Sales", "team", self.sam.pk),
        )

    def test_refusals_in_order(self):
        cases = [
            ({"function": "engineering"}, {"user_id": ["This field is required."]}),
            ({"user_id": None}, {"function": ["Choose a department."]}),
            ({"user_id": None, "function": "finance"}, {"function": ["Choose a department."]}),
            ({"user_id": 999999}, {"user_id": ["No such member."]}),
            ({"user_id": True}, {"user_id": ["No such member."]}),
        ]
        for body, expected in cases:
            with self.subTest(body=body):
                answer = self.patch(self.csm, body)
                self.assertEqual((answer.status_code, answer.json()), (400, expected))
        User.objects.filter(pk=self.ivy.pk).update(is_active=False)
        answer = self.patch(self.csm, {"user_id": self.ivy.pk})
        self.assertEqual(
            answer.json(), {"user_id": ["Ivy Eng is deactivated. Pick an active member."]}
        )
        self.assertFalse(AuditEvent.objects.filter(action="agent_bundle.handler_changed").exists())
        self.assertEqual(AgentBundle.objects.get(pk=self.bundle.pk).escalation["via"], "thread")

    def test_a_member_of_another_workspace_is_no_member(self):
        answer = self.patch(self.csm, {"user_id": self.stranger.pk})
        self.assertEqual(
            (answer.status_code, answer.json()), (400, {"user_id": ["No such member."]})
        )

    def test_anyone_active_in_any_department_may_be_chosen(self):
        # Sam is in Sales and can't open Pizza Hut: Jira gets Sam, the to-do waits for the owner.
        answer = self.patch(self.csm, {"user_id": self.sam.pk})
        self.assertEqual(answer.status_code, 200, answer.content)
        steps = {s.kind: s for s in self.bundle.steps.all()}
        self.assertEqual(steps["jira.assign"].payload["assignee_member_id"], self.sam.pk)
        self.assertEqual(
            (
                steps["task.create"].payload["assignee_id"],
                steps["task.create"].payload["assignee_name"],
            ),
            (None, ""),
        )
        self.assertEqual(
            steps["slack.reply"].payload["text"],
            TEMPLATE.replace("Erin Eng (Engineering)", "Sam Sales (Sales)"),
        )
        escalation = AgentBundle.objects.get(pk=self.bundle.pk).escalation
        self.assertEqual((escalation["function"], escalation["via"]), ("engineering", "chosen"))

    def test_not_an_escalation_and_someone_who_cant_read_it(self):
        self.assertEqual(self.patch(self.other, {"user_id": self.ivy.pk}).status_code, 404)
        AgentBundle.objects.filter(pk=self.bundle.pk).update(escalation={})
        answer = self.patch(self.csm, {"user_id": self.ivy.pk})
        self.assertEqual((answer.status_code, answer.json()["code"]), (409, "NOT_AN_ESCALATION"))

    def test_a_bundle_that_ran_is_a_conflict(self):
        AgentBundle.objects.filter(pk=self.bundle.pk).update(status="done")
        answer = self.patch(self.csm, {"user_id": self.ivy.pk})
        self.assertEqual((answer.status_code, answer.json()["code"]), (409, "BUNDLE_RAN"))

    def refreshed_meanwhile(self, change):
        """Patch `_person` (run between the unlocked read and the lock) so
        `change()` happens there, as a Refresh landing in between would."""
        from unittest.mock import patch

        from services.agents import escalation as module

        real = module._person

        def racing(*args):
            change()
            return real(*args)

        return patch.object(module, "_person", racing)

    def assert_nothing_changed(self, answer):
        self.assertEqual((answer.status_code, answer.json()["code"]), (409, "STEP_NOT_WAITING"))
        self.assertIn("bundle", answer.json())
        stored = AgentBundle.objects.get(pk=self.bundle.pk).escalation
        self.assertEqual((stored["user_id"], stored["via"]), (self.erin.pk, "thread"))
        self.assertNotIn("changed", stored)
        self.assertEqual(self.bundle.steps.get(kind="slack.reply").payload["text"], TEMPLATE)
        self.assertFalse(AuditEvent.objects.filter(action="agent_bundle.handler_changed").exists())

    def test_a_refresh_replacing_the_steps_meanwhile_changes_nothing(self):
        def replace():
            # A Refresh removes the read step 2 and adds its own in its place.
            step = self.bundle.steps.get(kind="jira.assign")
            payload, position = step.payload, step.position
            step.delete()
            self.step(
                self.pizza,
                kind="jira.assign",
                payload=payload,
                bundle=self.bundle,
                position=position,
            )

        with self.refreshed_meanwhile(replace):
            answer = self.patch(self.csm, {"user_id": self.ivy.pk})
        self.assert_nothing_changed(answer)
        self.assertEqual(
            self.bundle.steps.get(kind="jira.assign").payload["assignee_member_id"], self.erin.pk
        )

    def test_steps_that_stopped_waiting_meanwhile_change_nothing(self):
        def settle():
            self.bundle.steps.filter(kind="jira.assign").update(status="expired")

        with self.refreshed_meanwhile(settle):
            answer = self.patch(self.csm, {"user_id": self.ivy.pk})
        self.assert_nothing_changed(answer)
        self.assertEqual(
            self.bundle.steps.get(kind="task.create").payload["assignee_id"], self.erin.pk
        )

    def test_no_waiting_step_to_change(self):
        self.bundle.steps.filter(kind__in=("jira.assign", "task.create")).update(status="rejected")
        answer = self.patch(self.csm, {"user_id": self.ivy.pk})
        self.assertEqual((answer.status_code, answer.json()["code"]), (409, "STEP_NOT_WAITING"))
