"""The fifth rule action, "Start a plan" (plans spec §1.8): what it may say,
how the rule reads it back, the night (started, already had one, one per
parent, who owns it, a template since unshared), the pause when its
template is deleted, the lock order, and the builder's dry run."""

from datetime import timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.exceptions import ValidationError

from services.accounts.models import User
from services.customers.models import Customer, Task
from services.plans.models import Plan, PlanTemplate
from services.plans.tests.fixtures import PlanFixture
from services.rules import validation as say
from services.rules.models import Rule, RuleRunRecord
from services.rules.nightly import evaluate_rules
from services.rules.tests.fixtures import LIFECYCLE, NOTIFY_ME, TASK
from services.surveys.tests.fixtures import contact

RULES = "/api/v1/rules/"


class PlanActionFixture(PlanFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.onboarding = cls.builtin["onboarding"]

    def plan_action(self, template=None):
        return {"action": "plan", "template": (template or self.onboarding).pk}

    def night(self, days=0):
        return evaluate_rules(today=self.today + timedelta(days=days), now=self.now)

    def records(self, rule):
        rows = RuleRunRecord.objects.filter(run__rule=rule).order_by("record_id")
        return [(row.record_id, row.outcome, row.reason, row.actions) for row in rows]


class PlanValidationTests(PlanActionFixture):
    def refused(self, actions, kind="customer"):
        with self.assertRaises(ValidationError) as caught:
            say.clean_actions(actions, kind, self.csm)
        return caught.exception.detail

    def test_a_plan_action_is_normalised(self):
        cleaned = say.clean_actions(
            [{"action": "plan", "template": self.onboarding.pk, "x": 1}], "customer", self.csm
        )
        self.assertEqual(cleaned, [{"action": "plan", "template": self.onboarding.pk}])

    def test_the_template_may_be_sent_back_as_it_was_read(self):
        sent = [{"action": "plan", "template": {"id": self.mine.pk, "name": "Carl's kick-off"}}]
        self.assertEqual(
            say.clean_actions(sent, "contact", self.csm),
            [{"action": "plan", "template": self.mine.pk}],
        )

    def test_a_template_the_owner_cannot_read_is_refused(self):
        danas = self.make_template(owner=self.other, name="Dana's")
        for template in (danas.pk, None, "x", 999999, True):
            self.assertEqual(
                self.refused([{"action": "plan", "template": template}]),
                {"actions": [{"template": [say.CHOOSE_PLAN_TEMPLATE]}]},
                template,
            )

    def test_still_one_to_three_actions_each_once(self):
        self.assertEqual(
            self.refused([NOTIFY_ME, TASK, LIFECYCLE, self.plan_action()]),
            {"actions": [say.ACTION_COUNT]},
        )
        self.assertEqual(
            self.refused([self.plan_action(), self.plan_action()]),
            {"actions": [{}, {"action": [say.ONE_OF_EACH]}]},
        )


class PlanPayloadTests(PlanActionFixture):
    def test_the_rule_reads_its_template_by_name(self):
        body = {
            "name": "Onboard",
            "segment": self.book.pk,
            "trigger": "entered",
            "actions": [self.plan_action()],
        }
        response = self.api(self.csm).post(RULES, body, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(
            response.data["actions"],
            [{"action": "plan", "template": {"id": self.onboarding.pk, "name": "Onboarding"}}],
        )

    def test_a_deleted_template_reads_as_none_and_the_rule_cannot_be_turned_on(self):
        template = self.make_template(name="Gone soon")
        rule = self.make_rule(actions=[self.plan_action(template)], is_active=False)
        template.delete()
        data = self.api(self.csm).get(f"{RULES}{rule.pk}/").data
        self.assertEqual(data["actions"], [{"action": "plan", "template": None}])
        response = self.api(self.csm).patch(
            f"{RULES}{rule.pk}/", {"is_active": True}, format="json"
        )
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"actions": [{"template": [say.CHOOSE_PLAN_TEMPLATE]}]}),
        )

    def test_the_list_reads_in_a_fixed_number_of_queries(self):
        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.api(self.csm).get(RULES)
            return len(ctx.captured_queries)

        self.make_rule(name="A", actions=[self.plan_action()])
        one = count()
        self.make_rule(name="B", actions=[self.plan_action(self.mine)])
        self.make_rule(name="C", actions=[self.plan_action(self.builtin["qbr"])])
        self.assertEqual(count(), one)


class PlanNightTests(PlanActionFixture):
    def test_an_entered_record_gets_a_plan_owned_by_its_owner(self):
        rule = self.make_rule(actions=[TASK, self.plan_action()])
        self.changed(self.book, [self.pizza])
        result = self.night()
        self.assertEqual((result.ran, result.fired, result.failed), (1, 1, 0))
        plan = Plan.objects.get()
        self.assertEqual(
            (plan.customer, plan.owner, plan.started_by, plan.started_by_rule, plan.template),
            (self.pizza, self.csm, None, rule, self.onboarding),
        )
        self.assertEqual(
            self.records(rule),
            [
                (
                    self.pizza.pk,
                    "fired",
                    "",
                    [
                        {"action": "task", "status": "done", "detail": ""},
                        {"action": "plan", "status": "done", "detail": "started"},
                    ],
                )
            ],
        )
        self.assertEqual(Task.objects.filter(plan=plan).count(), 7)
        self.assertEqual(Task.objects.filter(plan__isnull=True, customer=self.pizza).count(), 1)
        self.assertEqual(
            self.notes("plan_started"),
            [
                (
                    self.csm.pk,
                    "Renewal watch started the plan Onboarding · Pizza Hut for you.",
                    f"/projects/{plan.pk}",
                )
            ],
        )

    def test_a_record_with_an_open_plan_is_unchanged_and_still_fires(self):
        self.build_plan(template=self.onboarding)
        rule = self.make_rule(actions=[self.plan_action()])
        self.changed(self.book, [self.pizza])
        self.night()
        self.assertEqual(
            self.records(rule),
            [
                (
                    self.pizza.pk,
                    "fired",
                    "",
                    [{"action": "plan", "status": "unchanged", "detail": "already had one"}],
                )
            ],
        )
        self.assertEqual(Plan.objects.count(), 1)

    def test_contacts_put_one_plan_on_their_organisation(self):
        amy = contact(self.pizza, "Amy")
        champions = self.pinned("contact", [self.ann, amy], name="Champions")
        rule = self.make_rule(segment=champions, actions=[self.plan_action()])
        self.changed(champions, [self.ann, amy])
        self.night()
        self.assertEqual(Plan.objects.filter(customer=self.pizza).count(), 1)
        started = [{"action": "plan", "status": "done", "detail": "started"}]
        self.assertEqual(
            self.records(rule),
            sorted([(self.ann.pk, "fired", "", started), (amy.pk, "fired", "", started)]),
        )

    def test_the_record_owner_owns_it_when_they_can(self):
        Customer.objects.filter(pk=self.pizza.pk).update(owner=self.mona)
        self.make_rule(actions=[self.plan_action()])
        self.changed(self.book, [self.pizza])
        self.night()
        self.assertEqual(Plan.objects.get().owner, self.mona)

    def test_an_inactive_record_owner_hands_it_to_the_rules_owner(self):
        Customer.objects.filter(pk=self.pizza.pk).update(owner=self.mona)
        User.objects.filter(pk=self.mona.pk).update(is_active=False)
        self.make_rule(actions=[self.plan_action()])
        self.changed(self.book, [self.pizza])
        self.night()
        self.assertEqual(Plan.objects.get().owner, self.csm)

    def test_a_template_no_longer_readable_fails_the_action(self):
        danas = self.make_template(owner=self.other, name="Dana's", sharing="workspace")
        rule = self.make_rule(actions=[self.plan_action(danas)])
        PlanTemplate.objects.filter(pk=danas.pk).update(sharing="private")
        self.changed(self.book, [self.pizza])
        self.night()
        self.assertEqual(
            self.records(rule),
            [
                (
                    self.pizza.pk,
                    "skipped",
                    "failed",
                    [
                        {
                            "action": "plan",
                            "status": "failed",
                            "detail": "its template can't be used",
                        }
                    ],
                )
            ],
        )
        self.assertFalse(Plan.objects.exists())

    def test_a_deleted_template_pauses_the_rule(self):
        template = self.make_template(name="Gone")
        rule = self.make_rule(actions=[self.plan_action(template)])
        template.delete()
        result = self.night()
        rule.refresh_from_db()
        self.assertEqual(
            (result.paused, rule.is_active, rule.paused_reason), (1, False, "template_gone")
        )
        self.assertEqual(Rule.Paused(rule.paused_reason).label, "Its plan template was deleted.")
        self.assertEqual(
            [message for _, message, _ in self.notes("rule_fired")],
            ["Renewal watch was switched off: Its plan template was deleted."],
        )

    def test_the_workspace_is_locked_before_any_record(self):
        self.make_rule(actions=[LIFECYCLE, self.plan_action()])
        self.changed(self.book, [self.pizza])
        with CaptureQueriesContext(connection) as ctx:
            self.night()
        locks = [q["sql"] for q in ctx.captured_queries if "FOR NO KEY UPDATE" in q["sql"]]
        workspace = next(i for i, sql in enumerate(locks) if 'FROM "accounts_organisation"' in sql)
        record = next(i for i, sql in enumerate(locks) if 'FROM "customers_customer"' in sql)
        self.assertLess(workspace, record)
        self.assertEqual(Plan.objects.count(), 1)


class PlanDryRunTests(PlanActionFixture):
    def body(self, actions):
        return {
            "segment": self.book.pk,
            "trigger": "schedule",
            "cadence": "weekly",
            "weekday": self.today.weekday(),
            "actions": actions,
        }

    def test_would_start_and_already_open(self):
        self.build_plan(template=self.onboarding)
        response = self.api(self.csm).post(
            f"{RULES}test/", self.body([self.plan_action()]), format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["plans"], {"would_start": 1, "already_open": 1})
        self.assertEqual(Plan.objects.count(), 1)

    def test_no_plan_action_no_plans(self):
        response = self.api(self.csm).post(f"{RULES}test/", self.body([NOTIFY_ME]), format="json")
        self.assertNotIn("plans", response.data)
