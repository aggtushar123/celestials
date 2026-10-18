"""Who may read which slice of the book, and the figures for each."""

import re

from django.conf import settings
from django.test import SimpleTestCase

from services.brain import scope
from services.brain.metrics import figures
from services.brain.tests.fixtures import BrainFixture
from services.customers.scoping import ScopeActor, SystemActor


class AvailableTests(BrainFixture):
    def test_each_reader_gets_their_scopes_narrowest_first_and_the_widest_by_default(self):
        cases = {
            self.csm: ["me"],
            self.mona: ["me", "team"],
            self.lee: ["me", "company"],
            self.admin: ["me", "company"],
            self.other: ["me"],
        }
        for reader, keys in cases.items():
            with self.subTest(reader=reader.name):
                self.assertEqual(scope.available(reader), keys)
                self.assertEqual(scope.default_key(reader), keys[-1])


class ResolveTests(BrainFixture):
    def test_me_and_team_carry_their_owners_and_a_stored_key(self):
        me = scope.resolve(self.csm, "me")
        self.assertEqual(
            (me.key, me.stored_key, me.label, me.owner_ids, me.user),
            ("me", f"me:{self.csm.id}", "Me", frozenset({self.csm.id}), self.csm),
        )
        team = scope.resolve(self.mona, "team")
        self.assertEqual(team.owner_ids, frozenset({self.mona.id, self.csm.id}))
        self.assertEqual((team.stored_key, team.label), (f"team:{self.mona.id}", "My team"))
        self.assertIsInstance(team.actor, ScopeActor)
        self.assertFalse(team.is_company)

    def test_company_is_the_organisation_itself(self):
        company = scope.resolve(self.lee, "company")
        self.assertEqual(
            (company.stored_key, company.owner_ids, company.label), ("company", None, "Company")
        )
        self.assertIs(type(company.actor), SystemActor)
        self.assertTrue(company.is_company)

    def test_a_scope_the_reader_cannot_use_is_refused(self):
        for reader, key in ((self.csm, "team"), (self.csm, "company"), (self.mona, "company")):
            with self.subTest(reader=reader.name, key=key):
                with self.assertRaises(scope.ScopeNotAllowed) as caught:
                    scope.resolve(reader, key)
                self.assertEqual(
                    (caught.exception.code, caught.exception.detail),
                    ("SCOPE_NOT_ALLOWED", "You can't see that view."),
                )
        with self.assertRaises(scope.ScopeUnknown) as caught:
            scope.resolve(self.admin, "everyone")
        self.assertEqual(
            (caught.exception.code, caught.exception.detail),
            ("SCOPE_UNKNOWN", "Choose me, team or company."),
        )


class FiguresTests(BrainFixture):
    def test_figures_are_recomputed_over_each_scopes_book(self):
        me = figures(scope.resolve(self.csm, "me"))
        team = figures(scope.resolve(self.mona, "team"))
        company = figures(scope.resolve(self.admin, "company"))
        self.assertEqual(me.values["active_arr"], 400_000.0)
        self.assertEqual(team.values["average_arr"], 150_000.0)
        self.assertEqual(company.values["active_arr"], 730_000.0)
        self.assertEqual(me.book, frozenset({self.pizza.id, self.dough.id}))
        self.assertIsNone(company.book)
        owners = {member for member, _label, _value in team.slices["at_risk_arr"]["owner"]}
        self.assertEqual(owners, {str(self.csm.id), str(self.mona.id)})

    def test_an_empty_book_counts_nothing_and_measures_nothing(self):
        empty = figures(scope.resolve(self.lee, "me"))
        self.assertEqual(empty.book, frozenset())
        self.assertEqual(empty.values["active_customers"], 0)
        self.assertIsNone(empty.values["nrr"])
        self.assertIsNone(empty.values["shelfware_arr"])


class OnlyTheResolverBuildsAScopeActorTests(SimpleTestCase):
    """§1.1: no view builds a ScopeActor itself."""

    def test_no_module_outside_the_resolver_and_the_tests_builds_one(self):
        root = settings.BASE_DIR / "services"
        allowed = root / "brain" / "scope.py"
        # Also catches `scoping.ScopeActor(`; only the class statement is exempt.
        pattern = re.compile(r"\bScopeActor\s*\(")
        offenders = []
        for path in root.rglob("*.py"):
            if "tests" in path.parts or path == allowed:
                continue
            for number, line in enumerate(path.read_text().splitlines(), start=1):
                if pattern.search(line) and not line.lstrip().startswith("class "):
                    offenders.append(f"{path.relative_to(root)}:{number}")
        self.assertEqual(offenders, [])
