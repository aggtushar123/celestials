"""A Slack message's bundle is its sender's alone (Slack bundles, owner
2026-10-17): the person who sent the message to Revenact reads, runs and
undoes it, while they may open its record. Anyone else (the record's owner,
their manager, view-all, Leadership) gets 404, is never offered it and never
has it counted in `hidden`: they don't know it exists."""

from django.utils import timezone

from services.agents import deciding
from services.agents.models import AgentBundle
from services.agents.tests.bundle_fixtures import BUNDLES, HISTORY
from services.agents.tests.slack_bundle_fixtures import FEED, SlackBundleFixture
from services.brain import desk
from services.brain.scope import ME, resolve
from services.customers.models import Customer

ACTIONS = "/api/v1/agents/actions/"


class SlackBundleReadRuleTests(SlackBundleFixture):
    def status(self, user, bundle):
        return self.client_for(user).get(f"{BUNDLES}{bundle.pk}/").status_code

    def bundle_items(self, user):
        body = self.client_for(user).get(FEED).json()
        items = [i for g in body["groups"] for i in g["items"] if i["kind"] == "bundle"]
        return items, body["hidden"]

    def test_only_the_sender_reads_it(self):
        # Mona sends a message about Pizza Hut, which Carl (who reports to her) owns.
        bundle = self.slack_bundle(self.slack_row(self.mona, self.pizza))
        self.assertEqual(self.status(self.mona, bundle), 200)
        self.assertEqual(self.status(self.csm, bundle), 404)  # the record's owner
        self.assertEqual(self.status(self.admin, bundle), 404)  # view-all
        self.assertEqual(self.status(self.lee, bundle), 404)  # Leadership
        self.assertEqual(self.status(self.other, bundle), 404)

    def test_the_senders_manager_does_not_read_it(self):
        bundle = self.slack_bundle(self.slack_row(self.csm, self.pizza))
        self.assertEqual(self.status(self.csm, bundle), 200)
        self.assertEqual(self.status(self.mona, bundle), 404)  # Carl reports to Mona

    def test_it_is_never_counted_as_hidden(self):
        bundle = self.slack_bundle(self.slack_row(self.mona, self.pizza))
        step = bundle.steps.get()
        for user in (self.csm, self.admin):
            with self.subTest(user=user.name):
                items, hidden = self.bundle_items(user)
                self.assertEqual((items, hidden), ([], 0))
                actions = self.client_for(user).get(ACTIONS).json()
                self.assertEqual((actions["count"], actions["hidden"]), (0, 0))
                self.assertEqual(self.client_for(user).get(f"{ACTIONS}{step.pk}/").status_code, 404)
        AgentBundle.objects.filter(pk=bundle.pk).update(status="done", run_by=self.mona)
        body = self.client_for(self.admin).get(HISTORY).json()
        self.assertEqual((body["count"], body["hidden"]), (0, 0))

    def test_it_waits_on_the_senders_own_mine(self):
        bundle = self.slack_bundle(self.slack_row(self.mona, self.pizza))
        items, hidden = self.bundle_items(self.mona)
        self.assertEqual([i["id"] for i in items], [bundle.pk])
        self.assertEqual(hidden, 0)
        self.assertEqual(items[0]["detail"]["routed_to"], "person")
        self.assertTrue(items[0]["detail"]["can_run"])
        mine = desk.agent_actions(self.mona, resolve(self.mona, ME), frozenset())
        self.assertEqual(list(mine.waiting.values_list("bundle_id", flat=True)), [bundle.pk])
        carls = desk.agent_actions(self.csm, resolve(self.csm, ME), frozenset())
        self.assertFalse(carls.waiting.filter(bundle=bundle).exists())

    def test_sender_is_the_only_role_and_only_while_they_may_open_the_record(self):
        bundle = self.slack_bundle(self.slack_row(self.mona, self.pizza))
        step = bundle.steps.get()
        self.assertEqual(deciding.decided_as(self.mona, step), deciding.SENDER)
        self.assertTrue(deciding.may_decide(self.mona, step))
        for user in (self.csm, self.admin, self.lee):
            self.assertIsNone(deciding.decided_as(user, step), user.name)
            self.assertFalse(deciding.may_decide(user, step), user.name)

    def test_losing_the_record_hides_it_from_the_sender_too(self):
        bundle = self.slack_bundle(self.slack_row(self.mona, self.dough))
        step = bundle.steps.get()
        self.assertEqual(self.status(self.mona, bundle), 200)
        # Dough Co moves from Carl to Dana: Mona can no longer open it.
        Customer.objects.filter(pk=self.dough.pk).update(owner=self.other)
        self.assertEqual(self.status(self.mona, bundle), 404)
        self.assertIsNone(deciding.decided_as(self.mona, step))
        self.assertEqual(self.status(self.other, bundle), 404)  # nor does the new owner read it

    def test_the_old_action_routes_refuse_everyone_but_the_sender(self):
        bundle = self.slack_bundle(self.slack_row(self.mona, self.pizza))
        step = bundle.steps.get()
        approve = f"{ACTIONS}{step.pk}/approve/"
        self.assertEqual(self.client_for(self.admin).post(approve, {}).status_code, 404)
        step.refresh_from_db()
        self.assertEqual(step.status, "proposed")
        self.assertLess(step.created_at, timezone.now())
