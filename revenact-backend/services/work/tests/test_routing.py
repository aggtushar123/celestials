"""Who a recommendation is for (spec §2.2 Routing, §6 "the routing
ladder"): the function owner, else the record owner (each only if active and
able to open the record); their manager in manager mode when that manager
is active and can open it too; with nobody suggested, the first active
view-all member, else the workspace's owner."""

from datetime import timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.accounts.models import Organisation, User
from services.customers.models import Account, Customer
from services.identity import ownership
from services.identity.models import OrganizationMembership
from services.knowledge.models import FunctionOwner
from services.work.models import DEFAULT_SOURCES
from services.work.routing import Route, Router
from services.work.sources import SOURCES, Signal, load_book
from services.work.tests.recommend_fixtures import RecommendFixture, task_proposal


class RoutingTests(RecommendFixture):
    def route(self, kind, record, *, to="manager", agent_action=None):
        """Route a signal on a fresh copy of `record` (fresh owners, so a
        deactivation in the test is seen)."""
        fresh = type(record).objects.select_related("owner").get(pk=record.pk)
        if isinstance(fresh, Account):
            customer, account = fresh.customers.order_by("id").first(), fresh
        else:
            customer, account = fresh, None
        signal = Signal(
            kind=kind,
            customer=customer,
            account=account,
            title="t",
            facts=(),
            evidence=(),
            value=1.0,
            agent_action=agent_action,
        )
        return Router(self.org, to).route(signal)

    def deactivate(self, *people):
        User.objects.filter(pk__in=[p.pk for p in people]).update(is_active=False)

    def answers_for(self, customer, user):
        FunctionOwner.objects.create(customer=customer, function=User.Function.CS, user=user)

    def test_the_record_owner_suggested_to_their_manager(self):
        self.assertEqual(self.route("renewal_due", self.dough), Route(self.csm, self.mona))

    def test_someone_with_no_manager_receives_their_own(self):
        self.assertEqual(self.route("renewal_due", self.taco), Route(self.other, self.other))

    def test_owner_mode_sends_it_straight_to_the_suggested_person(self):
        self.assertEqual(
            self.route("renewal_due", self.dough, to="owner"), Route(self.csm, self.csm)
        )

    def test_the_cs_function_owner_comes_before_the_record_owner(self):
        self.answers_for(self.dough, self.other)
        for kind in ("renewal_due", "health_drop", "urgent_tickets", "anomaly"):
            with self.subTest(kind=kind):
                self.assertEqual(self.route(kind, self.dough), Route(self.other, self.other))

    def test_an_account_signal_goes_to_the_account_owner(self):
        # Carl owns Taco East under Dana's Taco Bell; Mona can open it through him.
        self.assertEqual(self.route("renewal_due", self.east), Route(self.csm, self.mona))

    def test_a_candidate_who_cannot_open_the_record_is_passed_over(self):
        # Carl answers for Taco Bell, which lets him open it, but not Dana's Taco West.
        self.answers_for(self.taco, self.csm)
        self.assertEqual(self.route("renewal_due", self.west), Route(self.other, self.other))

    def test_an_inactive_candidate_is_passed_over(self):
        self.answers_for(self.dough, self.other)
        self.deactivate(self.other)
        self.assertEqual(self.route("renewal_due", self.dough), Route(self.csm, self.mona))

    def test_an_inactive_manager_is_skipped(self):
        self.deactivate(self.mona)
        self.assertEqual(self.route("renewal_due", self.dough), Route(self.csm, self.csm))

    def test_a_manager_who_cannot_open_the_record_is_skipped(self):
        # Dana answers for Dough Co; her manager Lee cannot open it.
        self.answers_for(self.dough, self.other)
        User.objects.filter(pk=self.other.pk).update(reports_to=self.lee)
        self.assertEqual(self.route("renewal_due", self.dough), Route(self.other, self.other))

    def test_nobody_suggested_goes_to_the_first_active_view_all_member(self):
        self.assertEqual(self.route("renewal_due", self.loose), Route(None, self.admin))

    def test_an_inactive_owner_falls_through_to_the_fallbacks(self):
        self.deactivate(self.csm)
        self.assertEqual(self.route("renewal_due", self.dough), Route(None, self.admin))

    def test_then_to_the_workspaces_owner(self):
        self.deactivate(self.admin)
        ownership.claim(self.mona, self.org)
        self.assertEqual(self.route("renewal_due", self.loose), Route(None, self.mona))

    def standing(self, user, status):
        OrganizationMembership.objects.filter(organisation=self.org, user=user).update(
            status=status
        )

    def test_a_suspended_or_revoked_view_all_member_is_no_fallback(self):
        ownership.claim(self.mona, self.org)
        for status in ("suspended", "revoked"):
            with self.subTest(status=status):
                self.standing(self.admin, status)
                self.assertEqual(self.route("renewal_due", self.loose), Route(None, self.mona))

    def test_a_suspended_or_revoked_owner_is_no_fallback(self):
        self.deactivate(self.admin)
        ownership.claim(self.mona, self.org)
        self.assertEqual(self.route("renewal_due", self.loose), Route(None, self.mona))
        for status in ("suspended", "revoked"):
            with self.subTest(status=status):
                self.standing(self.mona, status)
                self.assertIsNone(self.route("renewal_due", self.loose))

    def test_with_nobody_able_to_receive_it_it_is_not_routed(self):
        self.deactivate(self.admin)
        self.assertIsNone(self.route("renewal_due", self.loose))

    def test_the_agent_suggests_the_member_its_proposal_names(self):
        proposal = task_proposal(self.org, self.taco, assignee_name="carl csm")
        self.assertEqual(
            self.route("agent_action", self.taco, agent_action=proposal), Route(self.csm, self.mona)
        )

    def test_an_agent_name_that_is_no_member_falls_to_the_owner(self):
        proposal = task_proposal(self.org, self.taco, assignee_name="Nobody Here")
        self.assertEqual(
            self.route("agent_action", self.taco, agent_action=proposal),
            Route(self.other, self.other),
        )

    def test_can_open_is_asked_once_per_person_and_record(self):
        router = Router(self.org, "manager")
        dough = Customer.objects.select_related("owner").get(pk=self.dough.pk)
        signal = Signal("renewal_due", dough, None, "t", (), (), 1.0)
        router.route(signal)
        with self.assertNumQueries(0):
            router.route(signal)


class RoutingCostTests(RecommendFixture):
    """A refresh's routing costs a fixed number of queries per person, never
    one per record (spec §6): `can_open` is read once per candidate over
    the refresh's whole book, managers and members in one query each."""

    def add_records(self, count):
        owners = (self.csm, self.other, None)
        for n in range(count):
            owner = owners[n % len(owners)]
            customer = Customer.objects.create(
                organisation=self.org,
                name=f"Extra {Customer.objects.count()}",
                owner=owner,
                renewal_date=self.today + timedelta(days=5),
            )
            if owner is not None:
                account = Account.objects.create(name=f"{customer.name} EU", owner=owner)
                account.customers.add(customer)

    def routing_queries(self):
        organisation = Organisation.objects.get(pk=self.org.pk)
        book = load_book(organisation, today=self.today, now=timezone.now())
        signals = SOURCES["renewal_due"](book, DEFAULT_SOURCES["renewal_due"])
        signals += [
            Signal("renewal_due", book.parent_of[pk], account, "t", (), (), 1.0)
            for pk, account in book.accounts.items()
        ]
        router = Router.for_book(book, "manager")
        with CaptureQueriesContext(connection) as captured:
            routes = [router.route(signal) for signal in signals]
        return len(signals), len(captured.captured_queries), routes

    def test_four_times_the_records_costs_no_more_queries(self):
        FunctionOwner.objects.create(
            customer=self.dough, function=User.Function.CS, user=self.other
        )
        self.add_records(3)
        few, few_queries, _ = self.routing_queries()
        self.add_records(9)
        many, many_queries, routes = self.routing_queries()
        self.assertGreaterEqual(many, few + 12)
        self.assertEqual(many_queries, few_queries)
        self.assertTrue(all(route is not None for route in routes))

    def test_the_book_router_routes_as_the_plain_one(self):
        self.add_records(3)
        organisation = Organisation.objects.get(pk=self.org.pk)
        book = load_book(organisation, today=self.today, now=timezone.now())
        signals = SOURCES["renewal_due"](book, DEFAULT_SOURCES["renewal_due"])
        booked = Router.for_book(book, "manager")
        plain = Router(self.org, "manager")
        for signal in signals:
            with self.subTest(record=signal.customer.name):
                self.assertEqual(booked.route(signal), plain.route(signal))
