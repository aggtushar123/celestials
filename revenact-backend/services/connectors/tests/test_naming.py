"""Slack escalations D1 SE1-7: which customer a colleague's message names."""

from django.test import SimpleTestCase

from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors.naming import Name, covered_names, find, fold
from services.customers.models import Account, Customer


def name(label, type_="customer", id_=1, parents=()):
    return Name(fold(label), type_, id_, label, frozenset(parents))


class FoldTests(SimpleTestCase):
    def test_suffixes_and_case(self):
        self.assertEqual(fold("Globex (QA)"), "globex")
        self.assertEqual(fold("Initech, Inc."), "initech")
        self.assertEqual(fold("Acme Ltd"), "acme")
        self.assertEqual(fold("  Big   Bank LLC "), "big bank")


class FindTests(SimpleTestCase):
    NAMES = [
        name("Globex (QA)", id_=29),
        name("Initech (QA)", id_=30),
        name("Globex", "account", 7, parents={29}),
    ]

    def test_one_customer_named(self):
        found, candidates = find("Globex's CSV exports are failing, urgent", self.NAMES)
        self.assertEqual((found.type, found.id), ("customer", 29))  # its own account dropped
        self.assertEqual(candidates, [])

    def test_a_search_builds_no_pattern(self):
        """M1: each name's pattern is compiled once, with the name, never per
        message searched."""
        from unittest.mock import patch

        from services.connectors import naming

        names = [name("Globex (QA)", id_=29), name("Initech (QA)", id_=30)]
        with (
            patch.object(naming.re, "compile", side_effect=AssertionError),
            patch.object(naming.re, "search", side_effect=AssertionError),
        ):
            for _ in range(3):
                found, _ = find("Globex exports fail", names)
                self.assertEqual(found.id, 29)

    def test_whole_words_only(self):
        self.assertEqual(find("the globexian team", self.NAMES), (None, []))

    def test_two_named_are_candidates(self):
        found, candidates = find("Globex and Initech both fail", self.NAMES)
        self.assertIsNone(found)
        self.assertEqual([c.id for c in candidates], [29, 30])

    def test_none_named(self):
        self.assertEqual(find("Anyone for lunch?", self.NAMES), (None, []))

    def test_at_most_five_candidates_by_name(self):
        names = [name(f"Client {c}", id_=i) for i, c in enumerate("ABCDEFG")]
        _found, candidates = find(" ".join(f"Client {c}" for c in "GFEDCBA"), names)
        self.assertEqual([c.label for c in candidates], [f"Client {c}" for c in "ABCDE"])


class CoveredNamesTests(IntakeFixture):
    def test_a_workspace_wide_connection_covers_live_customers_and_accounts(self):
        archived = Customer.objects.create(organisation=self.org, name="Gone Co", is_archived=True)
        emea = Account.objects.create(name="Pizza Hut EMEA")
        emea.customers.add(self.pizza)
        slack = self.connector("slack", "")
        found = {(n.type, n.label) for n in covered_names(slack)}
        self.assertIn(("customer", "Pizza Hut"), found)
        self.assertIn(("account", "Pizza Hut EMEA"), found)
        self.assertNotIn(("customer", archived.name), found)

    def test_a_scoped_connection_covers_only_its_records(self):
        slack = self.connector("slack", "")
        slack.customers.add(self.pizza)
        # A linked customer's accounts are covered too (as Connector.covers).
        self.assertEqual({n.label for n in covered_names(slack)}, {"Pizza Hut", "Pizza EMEA"})

    def test_a_name_under_three_characters_is_not_covered(self):
        Customer.objects.create(organisation=self.org, name="Al")
        slack = self.connector("slack", "")
        self.assertNotIn("Al", {n.label for n in covered_names(slack)})

    def test_two_similar_customer_names_file_nothing(self):
        globex = Customer.objects.create(organisation=self.org, name="Globex")
        bank = Customer.objects.create(organisation=self.org, name="Globex Bank")
        slack = self.connector("slack", "")
        found, candidates = find("Globex Bank exports fail", covered_names(slack))
        self.assertIsNone(found)
        self.assertEqual({c.id for c in candidates}, {globex.id, bank.id})
