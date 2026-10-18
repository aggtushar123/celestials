"""What a rule does to each record, as its owner: one task per organisation
or account, a lifecycle stage audited with old and new values, and one
digest per recipient naming only what that recipient may open."""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext

from core.models import AuditEvent
from services.accounts.models import User
from services.customers.models import Account, Customer, Task
from services.notifications.models import Notification
from services.rules import actions
from services.rules.actions import (
    NOBODY,
    change_lifecycle,
    create_task,
    digest_message,
    notify_statuses,
    plan_digests,
    send_digests,
)
from services.rules.models import RuleRun
from services.rules.records import load
from services.rules.tests.fixtures import LIFECYCLE, NOTIFY_ME, TASK, RuleFixture
from services.segments.tests.fixtures import person
from services.surveys.tests.fixtures import contact

#: One rule task with the run's standing passed in: measured, see the test.
PER_TASK = 4  # measured: the task's own reads and writes and its notice


class ActionFixture(RuleFixture):
    def run_for(self, rule):
        return RuleRun.objects.create(rule=rule, run_on=self.today, started_at=self.now)

    def everyone(self):
        """Alice's segment of Pizza Hut (Carl's) and Taco Bell (Dana's)."""
        return self.pinned("customer", [self.pizza, self.taco], owner=self.admin, name="Everyone")


class TaskTests(ActionFixture):
    def make(self, rule, records, kind="customer", action=TASK):
        made = set()
        return [
            create_task(action, rule, record, kind, today=self.today, made=made)
            for record in records
        ]

    def test_a_task_on_the_record_for_the_rules_owner(self):
        rule = self.make_rule(actions=[TASK])
        statuses = self.make(rule, load("customer", [self.pizza.pk]))
        self.assertEqual(statuses, [{"action": "task", "status": "done", "detail": ""}])
        task = Task.objects.get()
        self.assertEqual(
            (task.customer, task.title, task.assignee, task.assignee_name, task.created_by),
            (self.pizza, "Call them", self.csm, "Carl CSM", self.csm),
        )
        self.assertEqual(
            (task.due_date, task.priority, task.status),
            (self.today + timedelta(days=3), "medium", "pending"),
        )

    def test_record_owner_is_the_records_own_owner(self):
        action = {**TASK, "assignee": "record_owner"}
        rule = self.make_rule(owner=self.admin, segment=self.everyone(), actions=[action])
        self.make(rule, load("customer", [self.pizza.pk, self.taco.pk]), action=action)
        assignees = dict(Task.objects.values_list("customer_id", "assignee_id"))
        self.assertEqual(assignees, {self.pizza.pk: self.csm.pk, self.taco.pk: self.other.pk})

    def test_no_owner_or_an_inactive_one_falls_back_to_the_rules_owner(self):
        action = {**TASK, "assignee": "record_owner"}
        rule = self.make_rule(owner=self.admin, segment=self.everyone(), actions=[action])
        Customer.objects.filter(pk=self.pizza.pk).update(owner=None)
        User.objects.filter(pk=self.other.pk).update(is_active=False)
        self.make(rule, load("customer", [self.pizza.pk, self.taco.pk]), action=action)
        self.assertEqual(set(Task.objects.values_list("assignee_id", flat=True)), {self.admin.pk})

    def test_a_suspended_or_revoked_owner_falls_back_to_the_rules_owner(self):
        from services.identity.models import OrganizationMembership

        action = {**TASK, "assignee": "record_owner"}
        rule = self.make_rule(owner=self.admin, segment=self.everyone(), actions=[action])
        memberships = OrganizationMembership.objects.filter(organisation=self.org)
        memberships.filter(user=self.csm).update(status="suspended")
        memberships.filter(user=self.other).update(status="revoked")
        self.make(rule, load("customer", [self.pizza.pk, self.taco.pk]), action=action)
        self.assertEqual(set(Task.objects.values_list("assignee_id", flat=True)), {self.admin.pk})

    def test_with_the_runs_standing_no_task_reads_it_again(self):
        from services.work.standing import working_ids

        rule = self.make_rule(actions=[TASK])
        records = load("customer", [self.pizza.pk, self.dough.pk])
        working = working_ids(self.org.pk)
        made = set()
        with CaptureQueriesContext(connection) as ctx:
            for record in records:
                create_task(
                    TASK, rule, record, "customer", today=self.today, made=made, working=working
                )
        self.assertEqual(Task.objects.count(), 2)
        # No standing read (`work.standing`: active memberships) among them.
        marker = '"identity_organizationmembership"."status" = \'active\''
        self.assertFalse([q for q in ctx.captured_queries if marker in q["sql"]])
        # Pinned: the same cost per task, with no standing read among them.
        Task.objects.all().delete()
        made = set()
        with self.assertNumQueries(PER_TASK):
            create_task(
                TASK, rule, records[0], "customer", today=self.today, made=made, working=working
            )

    def test_contacts_get_one_task_on_their_own_organisation_or_account(self):
        people = self.pinned("contact", [self.ann, self.ben], name="People")
        rule = self.make_rule(segment=people, actions=[TASK])
        pia = contact(self.pizza, "Pia")
        self.make(rule, load("contact", [self.ann.pk, pia.pk, self.ben.pk]), kind="contact")
        # Note: `sorted()` on a mixed int/None first element raises TypeError
        # in Python 3 regardless of outcome; a set comparison keeps the same
        # order-independent intent.
        self.assertEqual(
            set(Task.objects.values_list("customer_id", "account_id")),
            {(self.pizza.pk, None), (None, self.emea.pk)},
        )


class LifecycleTests(ActionFixture):
    def change(self, rule, record, kind="customer"):
        return change_lifecycle(LIFECYCLE, rule, record, kind, today=self.today, made=set())

    def test_the_stage_changes_and_is_audited_with_old_and_new(self):
        rule = self.make_rule(actions=[LIFECYCLE])
        status = self.change(rule, self.pizza)
        self.assertEqual(
            status, {"action": "lifecycle", "status": "done", "detail": "onboarding → renewal"}
        )
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.lifecycle_stage, "renewal")
        event = AuditEvent.objects.get(action="rule.field_changed")
        self.assertEqual(
            (event.actor, event.organisation, event.target_type, event.target_id),
            (None, self.org, "customers.customer", str(self.pizza.pk)),
        )
        self.assertEqual(event.target_repr, f"Customer {self.pizza.pk}")
        self.assertEqual(
            event.metadata,
            {"rule": rule.pk, "field": "lifecycle_stage", "old": "onboarding", "new": "renewal"},
        )

    def test_an_account_changes_too(self):
        accounts = self.pinned("account", [self.emea], name="Accounts")
        rule = self.make_rule(segment=accounts, actions=[LIFECYCLE])
        self.change(rule, self.emea, kind="account")
        self.assertEqual(Account.objects.get(pk=self.emea.pk).lifecycle_stage, "renewal")
        self.assertEqual(
            AuditEvent.objects.get(action="rule.field_changed").target_repr,
            f"Account {self.emea.pk}",
        )

    def test_the_records_row_lock_is_no_key(self):
        # it writes only lifecycle_stage, so it must not block FK inserts'
        # FOR KEY SHARE on the same row (a deadlock against claim / answers)
        with CaptureQueriesContext(connection) as ctx:
            self.change(self.make_rule(actions=[LIFECYCLE]), self.pizza)
        locks = [query["sql"] for query in ctx.captured_queries if " FOR " in query["sql"]]
        self.assertEqual(len(locks), 1, locks)
        self.assertIn('"customers_customer"', locks[0])
        self.assertIn("FOR NO KEY UPDATE", locks[0])

    def test_a_stage_already_in_place_is_unchanged_and_not_audited(self):
        Customer.objects.filter(pk=self.pizza.pk).update(lifecycle_stage="renewal")
        status = self.change(self.make_rule(actions=[LIFECYCLE]), self.pizza)
        self.assertEqual(
            status, {"action": "lifecycle", "status": "unchanged", "detail": "renewal"}
        )
        self.assertFalse(AuditEvent.objects.filter(action="rule.field_changed").exists())


class DigestMessageTests(ActionFixture):
    def test_names_three_organisations_then_counts(self):
        rule = self.make_rule()
        extra = [
            Customer.objects.create(organisation=self.org, name=name, owner=self.csm)
            for name in ("Apex", "Bolt")
        ]
        records = [self.pizza, self.dough, *extra]
        self.assertEqual(
            digest_message(rule, "customer", records, ""),
            "Renewal watch: Apex, Bolt, Dough Co and 1 more entered My book",
        )

    def test_contacts_are_counted_never_named(self):
        rule = self.make_rule(trigger="left")
        self.assertEqual(
            digest_message(rule, "contact", [self.ann], ""), "Renewal watch: 1 contact left My book"
        )
        self.assertEqual(
            digest_message(rule, "contact", [self.ann, self.dot], ""),
            "Renewal watch: 2 contacts left My book",
        )

    def test_crossed_and_schedule_wording(self):
        crossed = self.make_rule(
            trigger="crossed", score="csat", direction="below", threshold=Decimal("60.00")
        )
        self.assertEqual(
            digest_message(crossed, "customer", [self.pizza], ""),
            "Renewal watch: Pizza Hut CSAT fell below 60",
        )
        weekly = self.make_rule(trigger="schedule", cadence="weekly", weekday=0)
        self.assertEqual(
            digest_message(weekly, "customer", [self.pizza], ""),
            "Renewal watch: Pizza Hut came up on the weekly schedule",
        )

    def test_the_owners_note_follows_and_the_head_is_cut_to_200(self):
        rule = self.make_rule(name="x" * 120)
        long_names = [
            Customer.objects.create(organisation=self.org, name=f"{letter}" * 60, owner=self.csm)
            for letter in "abc"
        ]
        message = digest_message(rule, "customer", long_names, "Call them today")
        head, note = message.split(" · ")
        self.assertEqual((len(head), note), (200, "Call them today"))


class PlanTests(ActionFixture):
    def plan(self, action, rule, ids, kind="customer"):
        planned = plan_digests(action, rule, load(kind, ids), kind)
        return {user.pk: [record.pk for record in records] for user, records in planned.items()}

    def test_me_is_the_rules_owner(self):
        rule = self.make_rule()
        self.assertEqual(
            self.plan(NOTIFY_ME, rule, [self.pizza.pk, self.dough.pk]),
            {self.csm.pk: [self.pizza.pk, self.dough.pk]},
        )

    def test_a_record_owner_hears_only_about_their_own(self):
        action = {**NOTIFY_ME, "to": "record_owner"}
        rule = self.make_rule(owner=self.admin, segment=self.everyone(), actions=[action])
        self.assertEqual(
            self.plan(action, rule, [self.pizza.pk, self.taco.pk]),
            {self.csm.pk: [self.pizza.pk], self.other.pk: [self.taco.pk]},
        )

    def test_people_hear_only_about_records_they_may_open(self):
        action = {**NOTIFY_ME, "to": "people", "people": [self.csm.pk, self.other.pk]}
        rule = self.make_rule(owner=self.admin, segment=self.everyone(), actions=[action])
        self.assertEqual(
            self.plan(action, rule, [self.pizza.pk, self.taco.pk]),
            {self.csm.pk: [self.pizza.pk], self.other.pk: [self.taco.pk]},
        )

    def test_someone_who_may_open_none_of_it_hears_nothing(self):
        action = {**NOTIFY_ME, "to": "people", "people": [self.other.pk]}
        rule = self.make_rule(actions=[action])
        self.assertEqual(self.plan(action, rule, [self.pizza.pk]), {})

    def test_inactive_people_and_other_workspaces_hear_nothing(self):
        action = {**NOTIFY_ME, "to": "people", "people": [self.other.pk, self.stranger.pk]}
        rule = self.make_rule(owner=self.admin, segment=self.everyone(), actions=[action])
        User.objects.filter(pk=self.other.pk).update(is_active=False)
        self.assertEqual(self.plan(action, rule, [self.taco.pk]), {})


class SendTests(ActionFixture):
    def test_one_digest_per_recipient_linked_only_for_readers_of_the_rule(self):
        action = {**NOTIFY_ME, "to": "people", "people": [self.csm.pk, self.other.pk]}
        rule = self.make_rule(owner=self.admin, segment=self.everyone(), actions=[action])
        rule.shared_with.set([self.csm])
        rule.sharing = "people"
        rule.save(update_fields=["sharing"])
        run = self.run_for(rule)
        records = load("customer", [self.pizza.pk, self.taco.pk])
        statuses = notify_statuses(action, rule, run, records, "customer")
        self.assertEqual({status["status"] for status in statuses.values()}, {"done"})
        rows = Notification.objects.filter(kind="rule_fired").order_by("recipient_id")
        self.assertEqual(
            [(row.recipient_id, row.message, row.link) for row in rows],
            [
                (
                    self.csm.pk,
                    "Renewal watch: Pizza Hut entered Everyone",
                    f"/scenarios/rules/{rule.pk}?run={run.pk}",
                ),
                (self.other.pk, "Renewal watch: Taco Bell entered Everyone", ""),
            ],
        )

    def test_a_record_nobody_may_be_told_about_is_skipped(self):
        action = {**NOTIFY_ME, "to": "record_owner"}
        rule = self.make_rule(actions=[action])
        Customer.objects.filter(pk=self.dough.pk).update(owner=None)
        run = self.run_for(rule)
        statuses = notify_statuses(
            action, rule, run, load("customer", [self.pizza.pk, self.dough.pk]), "customer"
        )
        self.assertEqual(
            (statuses[self.pizza.pk]["status"], statuses[self.dough.pk]),
            ("done", {"action": "notify", "status": "skipped", "detail": actions.NOBODY}),
        )

    def test_one_failed_digest_never_stops_the_others(self):
        action = {**NOTIFY_ME, "to": "people", "people": [self.csm.pk, self.other.pk]}
        rule = self.make_rule(owner=self.admin, segment=self.everyone(), actions=[action])
        run = self.run_for(rule)
        real = actions.notify

        def flaky(**kwargs):
            if kwargs["recipient"].pk == self.other.pk:
                raise RuntimeError("down")
            return real(**kwargs)

        records = load("customer", [self.pizza.pk, self.taco.pk])
        plan = plan_digests(action, rule, records, "customer")
        with patch.object(actions, "notify", side_effect=flaky):
            with self.assertLogs("services.rules.actions", "WARNING") as logs:
                told, lost = send_digests(rule, run, plan, "customer", "")
        self.assertEqual((told, lost), ({self.pizza.pk}, {self.taco.pk}))
        self.assertEqual(Notification.objects.filter(kind="rule_fired").count(), 1)
        self.assertIn("RuntimeError", logs.output[0])
        self.assertNotIn("down", logs.output[0])

    def test_a_failure_reading_the_rule_loses_only_that_digest(self):
        action = {**NOTIFY_ME, "to": "people", "people": [self.csm.pk, self.other.pk]}
        rule = self.make_rule(owner=self.admin, segment=self.everyone(), actions=[action])
        run = self.run_for(rule)
        real = actions.readable_rules

        def flaky(user):
            if user.pk == self.other.pk:
                raise RuntimeError("Dana's row said no")
            return real(user)

        records = load("customer", [self.pizza.pk, self.taco.pk])
        plan = plan_digests(action, rule, records, "customer")
        with patch.object(actions, "readable_rules", side_effect=flaky):
            with self.assertLogs("services.rules.actions", "WARNING") as logs:
                told, lost = send_digests(rule, run, plan, "customer", "")
        self.assertEqual((told, lost), ({self.pizza.pk}, {self.taco.pk}))
        self.assertEqual(
            list(Notification.objects.filter(kind="rule_fired").values_list("recipient_id")),
            [(self.csm.pk,)],
        )
        self.assertNotIn("said no", logs.output[0])

    def test_a_280_character_note_fits_after_the_longest_head(self):
        note = "n" * 280
        action = {**NOTIFY_ME, "message": note}
        rule = self.make_rule(name="x" * 120, actions=[action])
        long_names = [
            Customer.objects.create(organisation=self.org, name=letter * 60, owner=self.csm)
            for letter in "abc"
        ]
        run = self.run_for(rule)
        notify_statuses(action, rule, run, load("customer", [c.pk for c in long_names]), "customer")
        message = Notification.objects.get(kind="rule_fired").message
        self.assertEqual(len(message), 200 + len(" · ") + 280)
        self.assertTrue(message.endswith(note))


class RecordOwnerDigestTests(ActionFixture):
    def test_contacts_are_told_to_their_organisations_or_accounts_owner(self):
        action = {**NOTIFY_ME, "to": "record_owner"}
        people = self.pinned(
            "contact", [self.ann, self.ben, self.tia], owner=self.admin, name="People"
        )
        rule = self.make_rule(owner=self.admin, segment=people, actions=[action])
        planned = plan_digests(
            action, rule, load("contact", [self.ann.pk, self.ben.pk, self.tia.pk]), "contact"
        )
        self.assertEqual(
            {user.pk: sorted(r.pk for r in records) for user, records in planned.items()},
            {self.csm.pk: sorted([self.ann.pk, self.ben.pk]), self.other.pk: [self.tia.pk]},
        )
        run = self.run_for(rule)
        notify_statuses(
            action, rule, run, load("contact", [self.ann.pk, self.ben.pk, self.tia.pk]), "contact"
        )
        messages = dict(
            Notification.objects.filter(kind="rule_fired").values_list("recipient_id", "message")
        )
        # contacts are counted, never named
        self.assertEqual(messages[self.csm.pk], "Renewal watch: 2 contacts entered People")
        self.assertEqual(messages[self.other.pk], "Renewal watch: 1 contact entered People")

    def test_an_inactive_record_owner_is_not_told_and_the_record_is_skipped(self):
        action = {**NOTIFY_ME, "to": "record_owner"}
        rule = self.make_rule(owner=self.admin, segment=self.everyone(), actions=[action])
        User.objects.filter(pk=self.other.pk).update(is_active=False)
        run = self.run_for(rule)
        statuses = notify_statuses(
            action, rule, run, load("customer", [self.pizza.pk, self.taco.pk]), "customer"
        )
        self.assertEqual(statuses[self.pizza.pk]["status"], "done")
        self.assertEqual(
            statuses[self.taco.pk], {"action": "notify", "status": "skipped", "detail": NOBODY}
        )
        self.assertEqual(
            list(Notification.objects.filter(kind="rule_fired").values_list("recipient_id")),
            [(self.csm.pk,)],
        )

    def test_queries_grow_by_a_fixed_cost_per_recipient_never_per_record(self):
        """`to: record_owner` across several owners: each recipient costs the
        same fixed number of queries (their visibility, their link, their one
        notification), and their records cost nothing more."""
        owners = [self.csm, self.other]
        owners += [person(f"csm{n}@acme.io", f"CSM {n}", self.org) for n in range(2)]
        books = {
            owner.pk: [
                Customer.objects.create(organisation=self.org, name=f"{owner.pk}-{n}", owner=owner)
                for n in range(3)
            ]
            for owner in owners
        }
        action = {**NOTIFY_ME, "to": "record_owner"}
        everyone = self.pinned(
            "customer", [c for book in books.values() for c in book], owner=self.admin, name="All"
        )
        rule = self.make_rule(owner=self.admin, segment=everyone, actions=[action])
        run = self.run_for(rule)

        def queries(owner_count, per_owner):
            ids = [c.pk for owner in owners[:owner_count] for c in books[owner.pk][:per_owner]]
            records = load("customer", ids)
            with CaptureQueriesContext(connection) as ctx:
                statuses = notify_statuses(action, rule, run, records, "customer")
            self.assertEqual({s["status"] for s in statuses.values()}, {"done"})
            return len(ctx.captured_queries)

        one_record, three_records = queries(1, 1), queries(1, 3)
        self.assertEqual(one_record, three_records)
        two, three, four = queries(2, 3), queries(3, 3), queries(4, 3)
        per_recipient = two - three_records
        self.assertEqual((three - two, four - three), (per_recipient, per_recipient))
        # org, membership, role and reports (visibility), openable, the link
        # check, and the savepoint around one insert
        self.assertLessEqual(per_recipient, 9)
