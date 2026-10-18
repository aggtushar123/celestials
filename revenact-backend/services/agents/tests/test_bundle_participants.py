"""Slack escalations D4, SE4-25, SE4-26 (spec §5.6): a member who took part
in the Slack thread may read, run, reject and change that bundle, and only
that one; one who can't open the customer sees the participant view (no
reason, no rationale, no evidence, no link to the record). Jira and Slack
are fakes."""

from core.models import AuditEvent
from services.agents.models import BundleParticipant
from services.agents.tests.outside_fixtures import OutsideFixture

DETAIL = "/api/v1/agents/bundles/{}/"
RUN = "/api/v1/agents/bundles/{}/run/"
REJECT = "/api/v1/agents/bundles/{}/reject/"


class ParticipantTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector(department="")
        # Slack in Engineering: Dana (Customer Success, owns Taco Bell) can't
        # read the thread's department or open Pizza Hut.
        self.support = self.slack_connector(department="engineering")
        self.conversation, self.thread = self.slack_thread(self.pizza, self.support)
        self.bundle = self.outside_bundle(
            self.thread, ("jira.create", self.jira_payload(self.board))
        )
        self.bundle.reason = "Pizza Hut's renewal is at risk."
        self.bundle.save(update_fields=["reason"])
        self.bundle.steps.update(rationale="ARR is 2M and health is 41.")

    def join(self, user, bundle=None):
        BundleParticipant.objects.create(bundle=bundle or self.bundle, user=user)

    def test_someone_who_took_no_part_cannot_see_it(self):
        self.assertEqual(
            self.client_for(self.other).get(DETAIL.format(self.bundle.pk)).status_code, 404
        )

    def test_a_participant_reads_it_in_the_participant_view(self):
        self.join(self.other)
        body = self.client_for(self.other).get(DETAIL.format(self.bundle.pk)).json()
        self.assertEqual(
            (body["participant_view"], body["reason"], body["steps"][0]["rationale"]),
            (True, "", ""),
        )
        self.assertEqual(
            body["record"],
            {"type": "customer", "id": self.pizza.pk, "name": "Pizza Hut", "can_open": False},
        )
        self.assertEqual(body["steps"][0]["evidence"], [])
        self.assertTrue(body["can_run"])
        # what will go to Jira is shown: it is what they accept
        self.assertEqual(body["steps"][0]["fields"]["summary"], "Login loop after password reset")

    def test_the_owner_reads_it_whole(self):
        # The owner who reads the thread's department reads it whole; one who
        # doesn't reads it only as a participant (today's read rule, SE4-26).
        self.thread.department = "cs"
        self.thread.save(update_fields=["department"])
        self.join(self.csm)
        body = self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()
        self.assertEqual(
            (body["participant_view"], body["reason"], body["record"]["can_open"]),
            (False, "Pizza Hut's renewal is at risk.", True),
        )
        self.assertEqual(body["steps"][0]["rationale"], "ARR is 2M and health is 41.")

    def test_a_participant_runs_it(self):
        self.join(self.other)
        rows = [{"id": s.pk, "selected": True} for s in self.bundle.steps.all()]
        answer = self.client_for(self.other).post(
            RUN.format(self.bundle.pk), {"steps": rows}, format="json"
        )
        self.assertEqual(answer.status_code, 200, answer.content)
        step = self.bundle.steps.get()
        self.assertEqual((step.status, step.decided_by_id), ("applied", self.other.pk))
        event = AuditEvent.objects.get(action="agent_action.approved")
        self.assertEqual(event.metadata["decided_as"], "participant")

    def test_a_participant_rejects_it(self):
        self.join(self.other)
        answer = self.client_for(self.other).post(
            REJECT.format(self.bundle.pk), {"reason": "not_relevant"}, format="json"
        )
        self.assertEqual(answer.status_code, 200, answer.content)

    def test_an_owner_who_took_part_but_cannot_read_the_thread_gets_the_participant_view(self):
        # CC-10: Carl owns Pizza Hut but doesn't read Engineering's Slack, so
        # he reads this bundle only as a participant (today's read rule).
        self.join(self.csm)
        body = self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()
        self.assertEqual(
            (body["participant_view"], body["record"]["can_open"], body["reason"]),
            (True, False, ""),
        )

    def test_a_participant_does_not_make_the_notice_say_no(self):
        # The new-proposal notice asks may_decide once per (kind, owner,
        # routing): a bundle the reader took part in is asked on its own.
        from services.metrics.models import AgentAction
        from services.work.proposal_notice import _decides_one

        first = self.outside_bundle(
            self.slack_thread(self.pizza, self.support, ts="1760349999.000100")[1],
            ("jira.create", self.jira_payload(self.board)),
        )
        self.join(self.other)
        # the step of a bundle Dana took no part in is asked first
        actions = AgentAction.objects.filter(bundle__in=[first, self.bundle]).order_by("-bundle_id")
        self.assertEqual([a.bundle_id for a in actions], [first.pk, self.bundle.pk])
        self.assertIs(_decides_one(self.other, actions), True)

    def test_the_right_is_for_that_bundle_only(self):
        other_bundle = self.outside_bundle(
            self.slack_thread(self.pizza, self.support, ts="1760349999.000100")[1],
            ("jira.create", self.jira_payload(self.board)),
        )
        self.join(self.other)
        client = self.client_for(self.other)
        self.assertEqual(client.get(DETAIL.format(other_bundle.pk)).status_code, 404)
        self.assertEqual(client.get(f"/api/v1/organizations/{self.pizza.pk}/").status_code, 404)


class ParticipantReplyTests(OutsideFixture):
    """F7: a participant runs the thread's reply even when they don't read
    the Slack connection's department (they wrote in that thread)."""

    def test_a_participant_from_another_department_posts_the_reply(self):
        support = self.slack_connector(department="cs")
        conversation, thread = self.slack_thread(self.pizza, support)
        bundle = self.outside_bundle(
            thread, ("slack.reply", self.slack_payload(conversation, support))
        )
        client = self.client_for(self.erin)  # Engineering, can't open Pizza Hut
        self.assertEqual(client.get(DETAIL.format(bundle.pk)).status_code, 404)
        BundleParticipant.objects.create(bundle=bundle, user=self.erin)
        body = client.get(DETAIL.format(bundle.pk)).json()
        self.assertEqual(
            (body["steps"][0]["can_run"], body["steps"][0]["disabled_reason"]), (True, None)
        )
        answer = self.run_all_steps(self.erin, bundle)
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertEqual(bundle.steps.get().status, "applied")
        self.assertEqual(len(self.slack.posts), 1)

    def test_a_participant_s_reply_moved_to_another_channel_follows_its_department(self):
        # I1: the exemption holds only for the reply to the thread itself; moved
        # to a channel the participant can't read, the department rule applies.
        from services.agents.outside import gates

        support = self.slack_connector(department="cs")
        sales = self.slack_connector(department="sales", channel="C0SALES", name="sales")
        conversation, thread = self.slack_thread(self.pizza, support)
        payload = self.slack_payload(conversation, support)
        payload.update(connector_id=sales.pk, channel="C0SALES", channel_name="sales")
        bundle = self.outside_bundle(thread, ("slack.reply", payload))
        BundleParticipant.objects.create(bundle=bundle, user=self.erin)
        stop = gates.blocked(bundle.steps.get(), self.erin)
        self.assertEqual(stop.sentence, "You can't post in #sales.")

    def test_a_non_participant_from_another_department_still_cannot_post(self):
        from services.agents.outside import gates

        support = self.slack_connector(department="cs")
        conversation, thread = self.slack_thread(self.pizza, support)
        bundle = self.outside_bundle(
            thread, ("slack.reply", self.slack_payload(conversation, support))
        )
        other = self.outside_bundle(
            self.slack_thread(self.pizza, support, ts="1760349999.000100")[1],
            ("slack.reply", self.slack_payload(conversation, support)),
        )
        BundleParticipant.objects.create(bundle=other, user=self.erin)
        stop = gates.blocked(bundle.steps.get(), self.erin)
        self.assertEqual(stop.sentence, "You can't post in #support.")
