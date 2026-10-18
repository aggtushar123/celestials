"""Slack escalations D2 spec §4.3, SE2-4, SE2-7, SE2-8: the account team
first, then the department head, then nobody; people who left or moved are
skipped; an account's own owner comes first for Customer Success (owner
ruling), then its one parent's answer, otherwise the head."""

from services.accounts.models import User
from services.knowledge.models import FunctionHead, FunctionOwner
from services.knowledge.ownership import handler_for
from services.knowledge.tests.heads_fixtures import HeadsFixture

#: A customer's team hit, and a fallback to the head (SE2-8); an account adds 1.
TEAM_QUERIES = 1
HEAD_QUERIES = 2
ACCOUNT_EXTRA_QUERIES = 1
#: An account whose own owner is off duty: its owner, then the parents (with
#: their owners), so a parent's owner hit adds nothing; the head adds 1.
OFF_DUTY_OWNER_TEAM_QUERIES = 2
OFF_DUTY_OWNER_HEAD_QUERIES = 3


class HandlerForCustomerTests(HeadsFixture):
    def setUp(self):
        super().setUp()
        FunctionHead.objects.create(organisation=self.org, function="engineering", user=self.jesh)
        FunctionHead.objects.create(organisation=self.org, function="cs", user=self.carl)

    def test_the_account_team_comes_first(self):
        FunctionOwner.objects.create(customer=self.globex, function="engineering", user=self.erin)
        globex = self.fresh(self.globex)
        with self.assertNumQueries(TEAM_QUERIES):
            self.assertEqual(handler_for(globex, "engineering"), (self.erin, "team"))

    def test_the_head_takes_it_when_nobody_on_the_team_does(self):
        globex = self.fresh(self.globex)
        with self.assertNumQueries(HEAD_QUERIES):
            self.assertEqual(handler_for(globex, "engineering"), (self.jesh, "head"))

    def test_nobody_when_there_is_no_head_either(self):
        globex = self.fresh(self.globex)
        with self.assertNumQueries(HEAD_QUERIES):
            self.assertEqual(handler_for(globex, "sales"), (None, "nobody"))

    def test_customer_success_is_the_owner_then_its_head(self):
        globex = self.fresh(self.globex)
        with self.assertNumQueries(TEAM_QUERIES):
            self.assertEqual(handler_for(globex, "cs"), (self.faiz, "team"))
        User.objects.filter(pk=self.faiz.pk).update(is_active=False)
        self.assertEqual(handler_for(self.fresh(self.globex), "cs"), (self.carl, "head"))
        self.globex.owner = None
        self.globex.save(update_fields=["owner"])
        self.assertEqual(handler_for(self.fresh(self.globex), "cs"), (self.carl, "head"))

    def test_the_owner_may_work_in_any_function(self):
        self.globex.owner = self.jesh  # an engineer owns the account
        self.globex.save(update_fields=["owner"])
        self.assertEqual(handler_for(self.fresh(self.globex), "cs"), (self.jesh, "team"))

    def test_people_who_left_are_skipped(self):
        FunctionOwner.objects.create(customer=self.globex, function="engineering", user=self.erin)
        User.objects.filter(pk=self.erin.pk).update(is_active=False)
        self.assertEqual(handler_for(self.fresh(self.globex), "engineering"), (self.jesh, "head"))
        User.objects.filter(pk=self.jesh.pk).update(is_active=False)
        self.assertEqual(handler_for(self.fresh(self.globex), "engineering"), (None, "nobody"))

    def test_people_who_moved_function_are_skipped(self):
        FunctionOwner.objects.create(customer=self.globex, function="engineering", user=self.erin)
        User.objects.filter(pk=self.erin.pk).update(function=User.Function.SALES)
        self.assertEqual(handler_for(self.fresh(self.globex), "engineering"), (self.jesh, "head"))
        User.objects.filter(pk=self.jesh.pk).update(function=User.Function.SALES)
        self.assertEqual(handler_for(self.fresh(self.globex), "engineering"), (None, "nobody"))

    def test_only_its_own_workspaces_head(self):
        FunctionHead.objects.filter(organisation=self.org, function="engineering").delete()
        FunctionHead.objects.create(
            organisation=self.elsewhere, function="engineering", user=self.zed
        )
        self.assertEqual(handler_for(self.fresh(self.globex), "engineering"), (None, "nobody"))
        # A wrong id from a caller never overrides the record's own workspace.
        self.assertEqual(
            handler_for(self.fresh(self.globex), "engineering", organisation_id=self.elsewhere.id),
            (None, "nobody"),
        )

    def test_an_unknown_function_is_a_bug(self):
        with self.assertRaises(ValueError):
            handler_for(self.globex, "finance")


class HandlerForAccountTests(HeadsFixture):
    def setUp(self):
        super().setUp()
        FunctionHead.objects.create(organisation=self.org, function="engineering", user=self.jesh)
        FunctionHead.objects.create(organisation=self.org, function="cs", user=self.carl)
        FunctionOwner.objects.create(customer=self.globex, function="engineering", user=self.erin)

    def test_one_parent_gives_its_answer(self):
        emea = self.fresh(self.account("Globex EMEA", self.globex, owner=self.carl))
        with self.assertNumQueries(ACCOUNT_EXTRA_QUERIES + TEAM_QUERIES):
            self.assertEqual(handler_for(emea, "engineering"), (self.erin, "team"))
        # Customer Success is the account's own owner first (owner ruling, 2026-10-16).
        fresh = self.fresh(emea)
        with self.assertNumQueries(TEAM_QUERIES):
            self.assertEqual(handler_for(fresh, "cs"), (self.carl, "team"))
        fresh = self.fresh(emea)
        with self.assertNumQueries(ACCOUNT_EXTRA_QUERIES + HEAD_QUERIES):
            self.assertEqual(handler_for(fresh, "sales"), (None, "nobody"))

    def test_customer_success_is_the_accounts_own_owner_first(self):
        emea = self.account("Globex EMEA", self.globex, owner=self.jesh)
        # An engineer owns the account: the owner may work in any function.
        self.assertEqual(handler_for(self.fresh(emea), "cs"), (self.jesh, "team"))
        User.objects.filter(pk=self.jesh.pk).update(is_active=False)
        fresh = self.fresh(emea)
        with self.assertNumQueries(OFF_DUTY_OWNER_TEAM_QUERIES):
            self.assertEqual(handler_for(fresh, "cs"), (self.faiz, "team"))
        User.objects.filter(pk=self.faiz.pk).update(is_active=False)
        fresh = self.fresh(emea)
        with self.assertNumQueries(OFF_DUTY_OWNER_HEAD_QUERIES):
            self.assertEqual(handler_for(fresh, "cs"), (self.carl, "head"))
        User.objects.filter(pk=self.faiz.pk).update(is_active=True)
        emea.owner = None
        emea.save(update_fields=["owner"])
        fresh = self.fresh(emea)
        with self.assertNumQueries(ACCOUNT_EXTRA_QUERIES):
            self.assertEqual(handler_for(fresh, "cs"), (self.faiz, "team"))
        User.objects.filter(pk=self.faiz.pk).update(is_active=False)
        self.assertEqual(handler_for(self.fresh(emea), "cs"), (self.carl, "head"))

    def test_two_parents_use_the_account_owner_then_the_heads(self):
        joint = self.account("Joint venture", self.globex, self.initech, owner=self.faiz)
        fresh = self.fresh(joint)
        with self.assertNumQueries(TEAM_QUERIES):
            self.assertEqual(handler_for(fresh, "cs"), (self.faiz, "team"))
        fresh = self.fresh(joint)
        with self.assertNumQueries(ACCOUNT_EXTRA_QUERIES + 1):
            # Globex's engineer is not the joint account's: the head takes it.
            self.assertEqual(handler_for(fresh, "engineering"), (self.jesh, "head"))
        joint.owner = None
        joint.save(update_fields=["owner"])
        self.assertEqual(handler_for(self.fresh(joint), "cs"), (self.carl, "head"))
        # Ruling B: an account with parents uses theirs, whatever id is passed.
        self.assertEqual(
            handler_for(self.fresh(joint), "engineering", organisation_id=self.elsewhere.id),
            (self.jesh, "head"),
        )

    def test_no_parent_needs_the_workspace_for_a_head(self):
        orphan = self.account("Orphan division", owner=self.faiz)
        self.assertEqual(handler_for(self.fresh(orphan), "cs"), (self.faiz, "team"))
        self.assertEqual(handler_for(self.fresh(orphan), "engineering"), (None, "nobody"))
        self.assertEqual(
            handler_for(self.fresh(orphan), "engineering", organisation_id=self.org.id),
            (self.jesh, "head"),
        )
