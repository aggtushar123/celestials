"""A segment definition as the agent writes it (contract): customer, account
or contact; a name and a why; one to eight conditions the segment rules
accept, as the workspace writes them."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.models import Organisation
from services.agents import evidence
from services.agents.builder import check_definition, definition_texts, member_counts, text
from services.agents.kinds import Invalid
from services.agents.tests.builder_fixtures import definition
from services.agents.tests.fixtures import AgentsFixture
from services.segments.evaluate import Draft
from services.segments.members import preview

LEAF = {"field": "health_category", "op": "is", "value": "poor"}


class DefinitionTests(AgentsFixture):
    def setUp(self):
        self.ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "ops", today=self.today)

    def check(self, **fields):
        return check_definition(definition(**fields), self.ctx)

    def test_a_good_definition_comes_back_clean(self):
        clean = self.check(name="  Poor health  ")
        self.assertEqual(clean["name"], "Poor health")
        self.assertEqual(clean["kind"], "customer")
        self.assertEqual(clean["rules"]["conditions"], [LEAF])
        self.assertEqual(definition_texts(clean), ["Poor health", clean["description"]])
        grouped = {"group": {"match": "any", "conditions": [LEAF] * 3}}
        self.check(rules={"match": "all", "conditions": [grouped] * 2})

    def test_what_is_refused(self):
        account = {"field": "organisation", "op": "is", "value": self.globex.pk}
        for fields in (
            {"kind": "deal"},
            {"name": " "},
            {"name": "x" * 121},
            {"description": "x" * 501},
            {"rules": {"match": "all", "conditions": []}},
            {"rules": {"match": "all", "conditions": [LEAF] * 9}},
            {"rules": {"match": "all", "conditions": [{"field": "shoe_size", "op": "is"}]}},
            {"rules": {"match": "all", "conditions": [{**LEAF, "op": "gt"}]}},
            {"rules": "everyone"},
            {"kind": "account", "rules": {"match": "all", "conditions": [account]}},
        ):
            with self.subTest(fields=fields), self.assertRaises(Invalid):
                self.check(**fields)
        with self.assertRaises(Invalid):
            check_definition("a segment", self.ctx)

    def test_text(self):
        self.assertEqual(text(" a ", 5), "a")
        self.assertEqual(text(None, 5, required=False), "")
        for value in ("", 7, "abcdef"):
            with self.subTest(value=value), self.assertRaises(Invalid):
                text(value, 5)


CONTACTS = {
    "kind": "contact",
    "rules": {"match": "all", "conditions": [{"field": "role", "op": "is", "value": "champion"}]},
}


class MemberCountTests(AgentsFixture):
    def test_each_reader_counts_their_own_members(self):
        rules = definition()["rules"]
        counts = {}
        for reader in (self.admin, self.csm, self.lee):
            (counts[reader.pk],) = member_counts(reader, [definition()], today=self.today)
            expected = preview(Draft("customer", rules), reader, today=self.today)["count"]
            self.assertEqual(counts[reader.pk], expected)
        self.assertGreaterEqual(counts[self.admin.pk], 2)
        self.assertEqual(counts[self.lee.pk], 0)

    def test_one_query_per_kind_however_many_and_no_distinct(self):
        # The reader's own membership is read once and kept on them: warm it.
        member_counts(self.admin, [definition()], today=self.today)

        def run(definitions):
            with CaptureQueriesContext(connection) as captured:
                member_counts(self.admin, definitions, today=self.today)
            sql = " ".join(q["sql"] for q in captured).upper()
            self.assertNotIn("DISTINCT", sql)
            return len(captured)

        one = run([definition()])
        self.assertEqual(run([definition()] * 4), one)
        self.assertEqual(run([definition(), CONTACTS, definition()]), one + 1)
