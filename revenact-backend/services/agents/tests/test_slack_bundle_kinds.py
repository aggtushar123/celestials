"""The steps a Slack bundle runs (Slack bundles, owner 2026-10-17), each on
the one record the message is about, as the person who sent it: the reply
in the message's own conversation, the Jira issue (once, shared with the
card), a pin into their own segment, a scenario run and a survey of the
record's people, now or once the Jira issue is resolved. Slack and Jira are
fakes; nothing is sent."""

from django.test import override_settings
from django.utils import timezone

from services.agents.bundle_payloads import bundle_payload, editable_keys, irreversible_now
from services.agents.kinds import Invalid, Stale, StepFailed
from services.agents.models import IssueWait
from services.agents.outside import gates
from services.agents.registry import REGISTRY
from services.agents.tests.slack_bundle_fixtures import SlackBundleFixture
from services.scenarios.models import Scenario, ScenarioRun
from services.scenarios.tests.test_engine import action_node, edge, entry
from services.segments.models import Segment
from services.surveys.models import SurveyInvite, SurveySend
from services.surveys.sending import Refusal, claim
from services.surveys.tests.fixtures import contact
from services.work.models import SlackSuggestion

UNDO = "/api/v1/agents/actions/{}/undo/"
STEP = "/api/v1/agents/bundles/{}/steps/{}/"
ISSUE_REPLY = "Thanks Faiz, logged as {{step 1.ticket_key}} ({{step 1.ticket_url}})."


class Steps(SlackBundleFixture):
    def setUp(self):
        super().setUp()
        self.chat = self.slack_connector()
        self.tracker = self.jira_connector(project="KAN")
        self.jira.types["KAN"] = [
            {"id": "20001", "name": "Task", "detail": ""},
            {"id": "20002", "name": "Bug", "detail": ""},
        ]

    def go(self, bundle, user=None):
        response = self.run_all_steps(user or self.csm, bundle)
        self.assertEqual(response.status_code, 200, response.content)
        return {step.kind: step for step in bundle.steps.all()}

    def issue_payload(self, row):
        return {**self.jira_payload(self.tracker, project="KAN"), "slack_suggestion_id": row.pk}


class SlackReplyToAMessageTests(Steps):
    def test_the_reply_goes_in_the_messages_thread_as_the_sender_once(self):
        row = self.slack_row(self.csm, self.pizza)
        bundle = self.slack_bundle(row, ("slack.reply", self.message_payload(row, self.chat)))
        steps = self.go(bundle)
        self.assertEqual(steps["slack.reply"].status, "applied")
        [posted] = self.slack.posts
        self.assertEqual(
            (posted["channel"], posted["thread_ts"], posted["text"], posted["actor"]),
            ("C0SUPPORT", row.message_ts, "Thanks Faiz, on it.", self.csm.pk),
        )
        row.refresh_from_db()
        self.assertIsNotNone(row.replied_at)
        self.assertEqual(row.reply_url, steps["slack.reply"].outputs["slack_url"])

    def test_a_direct_message_is_answered_in_the_conversation(self):
        row = self.slack_row(self.csm, self.pizza, channel="D0DM")
        bundle = self.slack_bundle(row, ("slack.reply", self.message_payload(row, self.chat)))
        self.go(bundle)
        [posted] = self.slack.posts
        self.assertEqual((posted["channel"], posted["thread_ts"]), ("D0DM", ""))

    def test_the_connections_department_never_stops_the_sender_answering_their_own_message(self):
        engineering = self.slack_connector(department="engineering", channel="C0ENG", name="eng")
        row = self.slack_row(self.csm, self.pizza)
        bundle = self.slack_bundle(row, ("slack.reply", self.message_payload(row, engineering)))
        step = bundle.steps.get()
        self.assertIsNone(gates.blocked(step, self.csm))
        self.assertEqual(self.go(bundle)["slack.reply"].status, "applied")

    def test_a_reply_already_sent_from_the_card_skips_the_step(self):
        row = self.slack_row(self.csm, self.pizza, replied_at=timezone.now())
        bundle = self.slack_bundle(row, ("slack.reply", self.message_payload(row, self.chat)))
        step = self.go(bundle)["slack.reply"]
        self.assertEqual(step.status, "skipped")
        self.assertEqual(step.result["note"], "You already replied to this message from Work.")
        self.assertEqual(self.slack.posts, [])

    def test_the_reply_carries_the_issue_only_where_nobody_outside_reads_it(self):
        for shared in (True, False):
            with self.subTest(shared=shared):
                self.slack.posts.clear()
                self.slack.shared_channels = {"C0SUPPORT"} if shared else set()
                row = self.slack_row(self.csm, self.pizza)
                bundle = self.slack_bundle(
                    row,
                    ("jira.create", self.issue_payload(row)),
                    ("slack.reply", self.message_payload(row, self.chat, text=ISSUE_REPLY)),
                )
                steps = self.go(bundle)
                key = steps["jira.create"].outputs["ticket_key"]
                if shared:
                    self.assertEqual(steps["slack.reply"].status, "failed")
                    self.assertIn("shared outside your company", steps["slack.reply"].error)
                    self.assertEqual(self.slack.posts, [])
                else:
                    self.assertEqual(steps["slack.reply"].status, "applied")
                    self.assertIn(key, self.slack.posts[0]["text"])

    def test_only_the_text_can_be_changed(self):
        row = self.slack_row(self.csm, self.pizza)
        bundle = self.slack_bundle(row, ("slack.reply", self.message_payload(row, self.chat)))
        step = bundle.steps.get()
        self.assertEqual(editable_keys(step), ["text"])
        moved = self.client_for(self.csm).patch(
            STEP.format(bundle.pk, step.pk),
            {"fields": {"channel_choice": f"{self.chat.pk}:C0OTHER"}},
            format="json",
        )
        self.assertEqual(moved.status_code, 400)
        edited = self.client_for(self.csm).patch(
            STEP.format(bundle.pk, step.pk), {"fields": {"text": "On it now."}}, format="json"
        )
        self.assertEqual(edited.status_code, 200, edited.content)
        preview = bundle_payload(bundle, self.csm)["steps"][0]["preview"]["slack"]
        self.assertEqual(
            (preview["channel"], preview["excerpt"]), ("The message's thread", "On it now.")
        )


class JiraFromAMessageTests(Steps):
    def test_the_issue_is_made_once_and_written_on_the_message(self):
        row = self.slack_row(self.csm, self.pizza)
        bundle = self.slack_bundle(row, ("jira.create", self.issue_payload(row)))
        step = self.go(bundle)["jira.create"]
        key = step.outputs["ticket_key"]
        self.assertTrue(key.startswith("KAN-"))
        row.refresh_from_db()
        self.assertEqual((row.jira_key, row.jira_url), (key, step.outputs["ticket_url"]))
        # The card reuses it: no second issue.
        again = self.client_for(self.csm).post(f"/api/v1/work/slack-messages/{row.pk}/jira/", {})
        self.assertEqual((again.status_code, again.json()["key"]), (200, key))
        self.assertEqual(len(self.jira.created), 1)

    def test_an_issue_the_card_made_first_is_reused(self):
        row = self.slack_row(
            self.csm,
            self.pizza,
            jira_key="KAN-7",
            jira_url="https://acme.atlassian.net/browse/KAN-7",
        )
        bundle = self.slack_bundle(row, ("jira.create", self.issue_payload(row)))
        step = self.go(bundle)["jira.create"]
        self.assertEqual((step.status, step.outputs["ticket_key"]), ("applied", "KAN-7"))
        self.assertEqual(self.jira.created, [])

    def test_one_issue_per_message_whatever_its_summary(self):
        row = self.slack_row(self.csm, self.pizza)
        spec = REGISTRY["jira.create"]
        self.assertEqual(spec.target(self.issue_payload(row)), f"jira:create:slack:{row.pk}")


class SegmentPinTests(Steps):
    def segment(self, owner=None, **fields):
        return Segment.objects.create(
            organisation=self.org,
            owner=owner or self.csm,
            name="At-risk renewals",
            kind="customer",
            **fields,
        )

    def pin_bundle(self, segment, before="none"):
        row = self.slack_row(self.csm, self.pizza)
        payload = {"segment_id": segment.pk, "segment": segment.name, "kind": "customer"}
        return self.slack_bundle(row, ("segment.pin", payload))

    def test_run_pins_the_record_and_undo_puts_it_back(self):
        segment = self.segment(excluded_ids=[self.pizza.pk])
        bundle = self.pin_bundle(segment)
        step = bundle.steps.get()
        self.assertEqual(step.before, "excluded")
        step = self.go(bundle)["segment.pin"]
        segment.refresh_from_db()
        self.assertEqual((segment.pinned_ids, segment.excluded_ids), ([self.pizza.pk], []))
        self.assertEqual(step.outputs["segment_url"], f"/segments/{segment.pk}")
        response = self.client_for(self.csm).post(UNDO.format(step.pk), {})
        self.assertEqual(response.status_code, 200, response.content)
        segment.refresh_from_db()
        self.assertEqual((segment.pinned_ids, segment.excluded_ids), ([], [self.pizza.pk]))

    def test_someone_elses_segment_is_never_changed(self):
        segment = self.segment()
        bundle = self.pin_bundle(segment)
        Segment.objects.filter(pk=segment.pk).update(owner=self.mona)
        step = self.go(bundle)["segment.pin"]
        self.assertEqual(
            (step.status, step.error), ("failed", "This segment isn't yours any more.")
        )
        segment.refresh_from_db()
        self.assertEqual(segment.pinned_ids, [])

    def test_the_pin_limit_holds(self):
        segment = self.segment(pinned_ids=list(range(100_000, 100_500)))
        step = self.go(self.pin_bundle(segment))["segment.pin"]
        self.assertEqual(step.status, "failed")
        self.assertIn("at most 500", step.error)

    def test_a_record_pinned_by_hand_meanwhile_expires_the_step(self):
        segment = self.segment()
        bundle = self.pin_bundle(segment)
        Segment.objects.filter(pk=segment.pk).update(pinned_ids=[self.pizza.pk])
        step = self.go(bundle)["segment.pin"]
        self.assertEqual((step.status, step.expired_reason), ("expired", "changed"))

    def test_undo_refuses_once_its_place_changed(self):
        segment = self.segment()
        step = self.go(self.pin_bundle(segment))["segment.pin"]
        released = self.client_for(self.csm).patch(
            f"/api/v1/segments/{segment.pk}/members/{self.pizza.pk}/", {"state": "none"}
        )
        self.assertEqual(released.status_code, 200, released.content)
        response = self.client_for(self.csm).post(UNDO.format(step.pk), {})
        self.assertEqual(response.json()["code"], "CHANGED_SINCE")

    def test_only_the_senders_own_unpinned_segment_of_the_records_kind_is_valid(self):
        from services.agents import evidence

        spec = REGISTRY["segment.pin"]
        ctx = evidence.Context(self.org, "cs", self.today)
        ctx.editable_segments = {
            1: {"id": 1, "name": "A", "kind": "customer", "state": "none"},
            2: {"id": 2, "name": "B", "kind": "account", "state": "none"},
            3: {"id": 3, "name": "C", "kind": "customer", "state": "pinned"},
        }
        row = {"ref": f"customer:{self.pizza.pk}", "kind": "customer", "id": self.pizza.pk}
        self.assertEqual(spec.validate({"segment_id": 1}, row, ctx, [])["segment_id"], 1)
        for pk in (2, 3, 4, "1"):
            with self.subTest(pk=pk), self.assertRaises(Invalid):
                spec.validate({"segment_id": pk}, row, ctx, [])


class ScenarioRunTests(Steps):
    def scenario(self, nodes=None, edges=None, **fields):
        return Scenario.objects.create(
            organisation=self.org,
            name="Escalation playbook",
            nodes=[entry(), action_node("n1", "End")] if nodes is None else nodes,
            edges=[edge("entry", "n1")] if edges is None else edges,
            **fields,
        )

    def run_bundle(self, scenario):
        row = self.slack_row(self.csm, self.pizza)
        payload = {"scenario_id": scenario.pk, "scenario": scenario.name}
        return self.slack_bundle(row, ("scenario.run", payload))

    def test_run_runs_it_on_the_organisation_as_an_agent_run(self):
        scenario = self.scenario()
        step = self.go(self.run_bundle(scenario))["scenario.run"]
        run = ScenarioRun.objects.get(scenario=scenario)
        self.assertEqual(
            (run.customer_id, run.triggered_by, run.status), (self.pizza.pk, "agent", "success")
        )
        self.assertEqual((step.status, step.result["note"]), ("applied", "The scenario ran."))

    def test_a_failed_run_is_kept_as_it_went_and_never_retried(self):
        scenario = self.scenario(nodes=[], edges=[])
        step = self.go(self.run_bundle(scenario))["scenario.run"]
        self.assertEqual(step.status, "applied")
        self.assertEqual(step.result["status"], "failed")
        self.assertIn("a step failed", step.result["note"])
        self.assertEqual(ScenarioRun.objects.filter(scenario=scenario).count(), 1)

    def test_it_cant_be_undone(self):
        step = self.go(self.run_bundle(self.scenario()))["scenario.run"]
        response = self.client_for(self.csm).post(UNDO.format(step.pk), {})
        self.assertEqual(
            (response.json()["code"], response.json()["detail"]),
            ("CHANGED_SINCE", "This scenario has run."),
        )

    def test_run_needs_a_runner_who_may_open_the_organisation(self):
        bundle = self.run_bundle(self.scenario())
        step = bundle.steps.get()
        with self.assertRaises(StepFailed):
            REGISTRY["scenario.run"].apply(step, self.other)
        with self.assertRaises(Stale):
            REGISTRY["scenario.run"].apply(step, None)

    def test_only_an_organisation_and_a_listed_scenario_are_valid(self):
        from services.agents import evidence

        spec = REGISTRY["scenario.run"]
        ctx = evidence.Context(self.org, "cs", self.today)
        ctx.scenarios = {5: {"id": 5, "name": "Playbook"}}
        customer = {"ref": "customer:1", "kind": "customer", "id": 1}
        account = {"ref": "account:1", "kind": "account", "id": 1}
        self.assertEqual(
            spec.validate({"scenario_id": 5}, customer, ctx, [])["scenario"], "Playbook"
        )
        for row, pk in ((account, 5), (customer, 6)):
            with self.subTest(row=row["kind"], pk=pk), self.assertRaises(Invalid):
                spec.validate({"scenario_id": pk}, row, ctx, [])

    def test_an_accounts_scenario_is_stale(self):
        scenario = self.scenario(apply_to=Scenario.ApplyTo.ACCOUNTS)
        step = self.go(self.run_bundle(scenario))["scenario.run"]
        self.assertEqual(step.status, "expired")


class RecordSurveyTests(Steps):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        contact(cls.pizza, "Ann")
        contact(cls.dough, "Dan")

    def survey(self, **fields):
        return {
            "survey_type": "csat",
            "subject": "How did we do?",
            "intro": "One question.",
            "roles": ["champion"],
            "timing": "now",
            "record": "Pizza Hut",
            **fields,
        }

    def test_now_sends_it_to_the_records_own_people_as_the_runner(self):
        row = self.slack_row(self.csm, self.pizza)
        step = self.go(self.slack_bundle(row, ("survey.record", self.survey())))["survey.record"]
        self.assertEqual(step.status, "applied", step.error)
        send = SurveySend.objects.get(pk=step.result["survey_id"])
        self.assertEqual(
            (send.owner_id, send.customer_id, send.segment_id, send.status),
            (self.csm.pk, self.pizza.pk, None, "sending"),
        )
        self.assertEqual(
            list(SurveyInvite.objects.filter(send=send).values_list("email", flat=True)),
            ["ann@example.com"],
        )
        self.assertTrue(step.irreversible)

    def test_after_jira_waits_for_the_issue_and_undo_cancels_it(self):
        row = self.slack_row(self.csm, self.pizza)
        bundle = self.slack_bundle(
            row,
            ("jira.create", self.issue_payload(row)),
            (
                "survey.record",
                self.survey(
                    timing="after_jira",
                    issue="{{step 1.ticket_key}}",
                    connector_id=self.tracker.pk,
                ),
            ),
        )
        self.assertFalse(irreversible_now(bundle.steps.get(kind="survey.record")))
        steps = self.go(bundle)
        key = steps["jira.create"].outputs["ticket_key"]
        step = steps["survey.record"]
        self.assertEqual(step.status, "applied", step.error)
        self.assertEqual(step.result["note"], f"Sends when {key} is resolved.")
        self.assertFalse(step.irreversible)
        wait = IssueWait.objects.get(action=step)
        self.assertEqual(
            (wait.issue_key, wait.status, wait.owner_id), (key, "waiting", self.csm.pk)
        )
        self.assertEqual(SurveySend.objects.get(pk=wait.survey_send_id).status, "draft")
        preview = bundle_payload(bundle, self.csm)["steps"][1]["preview"]["record_survey"]
        self.assertEqual(preview["wait"], {"status": "waiting", "label": f"Waiting for {key}"})
        response = self.client_for(self.csm).post(UNDO.format(step.pk), {})
        self.assertEqual(response.status_code, 200, response.content)
        wait.refresh_from_db()
        self.assertEqual(wait.status, "cancelled")
        self.assertFalse(SurveySend.objects.filter(pk=wait.survey_send_id).exists())

    def test_after_jira_needs_the_bundles_issue_step(self):
        from services.agents import evidence

        spec = REGISTRY["survey.record"]
        ctx = evidence.Context(self.org, "cs", self.today)
        ctx.slack_message = {"id": 1}
        row = {"ref": f"customer:{self.pizza.pk}", "kind": "customer", "name": "Pizza Hut"}
        with self.assertRaises(Invalid):
            spec.validate(self.survey(timing="after_jira"), row, ctx, [])
        ctx.issue_step, ctx.jira_connector = 1, {"id": self.tracker.pk, "project": "KAN"}
        clean = spec.validate(self.survey(timing="after_jira"), row, ctx, [])
        self.assertEqual(clean["issue"], "{{step 1.ticket_key}}")

    def test_a_one_record_send_is_claimed_only_by_its_owner(self):
        send = SurveySend.objects.create(
            organisation=self.org,
            owner=self.csm,
            name="CSAT",
            survey_type="csat",
            subject="Hi",
            roles=["champion"],
            customer=self.pizza,
        )
        with self.assertRaises(Refusal) as refused:
            claim(send.pk, self.mona, today=self.today, now=timezone.now())
        self.assertEqual(refused.exception.status, 403)
        claim(send.pk, self.csm, today=self.today, now=timezone.now())
        self.assertEqual(SurveyInvite.objects.filter(send=send).count(), 1)


class MessageRowsTests(Steps):
    def test_the_message_row_is_its_workspaces_own(self):
        row = self.slack_row(self.csm, self.pizza)
        SlackSuggestion.objects.filter(pk=row.pk).update(jira_key="KAN-9")
        payload = {**self.issue_payload(row)}
        bundle = self.slack_bundle(row, ("jira.create", payload))
        from services.agents.actions.jira_issues import _message_issue

        step = bundle.steps.get()
        self.assertEqual(_message_issue(step).key, "KAN-9")
        step.organisation_id = self.other_org.pk
        self.assertIsNone(_message_issue(step))


@override_settings(SLACK_JIRA_PROJECT="KAN")
class ProjectTests(Steps):
    def test_the_issue_lands_in_the_slack_project(self):
        row = self.slack_row(self.csm, self.pizza)
        step = self.go(self.slack_bundle(row, ("jira.create", self.issue_payload(row))))[
            "jira.create"
        ]
        self.assertEqual(
            self.jira.issues[step.outputs["ticket_key"]]["fields"]["project"], {"key": "KAN"}
        )
