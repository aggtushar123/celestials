"""Each record's people, by role, in every agent's evidence (contract,
canvas.create): counted, never named, an organisation's own and its
accounts', in two queries without DISTINCT."""

from collections import Counter

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.models import Organisation
from services.agents import bulk, evidence
from services.agents.people import people_line, record_people, visible_people
from services.agents.tests.builder_fixtures import builder_action
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import Contact
from services.surveys.tests.fixtures import contact


class PeopleLineTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        contact(cls.pizza, "Ann", Contact.Role.CHAMPION)
        contact(cls.pizza, "Cal", Contact.Role.OTHER)
        contact(cls.emea, "Ben", Contact.Role.DECISION_MAKER)

    def test_an_organisation_counts_its_accounts_people_and_an_account_its_own(self):
        found = record_people(Contact.objects.all(), [self.pizza.pk], [self.emea.pk])
        self.assertEqual(
            found[f"customer:{self.pizza.pk}"],
            Counter({"champion": 1, "other": 1, "decision_maker": 1}),
        )
        self.assertEqual(found[f"account:{self.emea.pk}"], Counter({"decision_maker": 1}))

    def test_the_line_is_counts_in_map_order_and_none_for_nobody(self):
        counts = Counter({"other": 3, "champion": 2, "decision_maker": 1})
        self.assertEqual(people_line(counts), "people: 6 (decision maker 1, champion 2, other 3)")
        self.assertIsNone(people_line(Counter()))

    def test_every_agent_sees_the_line_and_no_name(self):
        org = Organisation.objects.get(pk=self.org.pk)
        for agent in ("cs", "ops"):
            ctx = evidence.build(org, agent, today=self.today)
            row = ctx.records[f"customer:{self.pizza.pk}"]
            line = "people: 3 (decision maker 1, champion 1, other 1)"
            self.assertEqual(row["people"], line)
            self.assertIn(f"    {line}", evidence.record_block(ctx, row))
            self.assertIn(line, evidence.record_lines(ctx, f"customer:{self.pizza.pk}"))
            self.assertIsNone(ctx.records[f"customer:{self.dough.pk}"]["people"])
            block = "\n".join(evidence.record_block(ctx, row))
            for name in ("Ann", "Cal", "Ben"):
                self.assertNotIn(name, block)

    def test_counting_is_two_queries_without_distinct(self):
        with CaptureQueriesContext(connection) as captured:
            record_people(Contact.objects.all(), [self.pizza.pk, self.dough.pk], [self.emea.pk])
        self.assertEqual(len(captured), 2)
        self.assertNotIn("DISTINCT", " ".join(q["sql"] for q in captured).upper())


class VisiblePeopleTests(AgentsFixture):
    """Taco Bell's people: Tia on it, Eve on Taco East (Carl's), Tom on Taco
    West (Dana's). Carl opens Taco Bell through Taco East, but not Taco
    West."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        contact(cls.taco, "Tia", Contact.Role.CHAMPION)
        contact(cls.east, "Eve", Contact.Role.INFLUENCER)
        contact(cls.west, "Tom", Contact.Role.OTHER)

    def test_each_reader_counts_only_who_they_may_open(self):
        refs = [f"customer:{self.taco.pk}", f"account:{self.west.pk}"]
        self.assertEqual(visible_people(self.other, refs), dict(zip(refs, [3, 1], strict=True)))
        self.assertEqual(visible_people(self.csm, refs), dict(zip(refs, [2, 0], strict=True)))
        self.assertEqual(visible_people(self.lee, refs), dict(zip(refs, [0, 0], strict=True)))

    def test_two_queries_without_distinct(self):
        refs = [f"customer:{self.taco.pk}", f"account:{self.west.pk}"]
        visible_people(self.csm, refs)  # the reader's own scope is looked up (and cached) once
        with CaptureQueriesContext(connection) as captured:
            visible_people(self.csm, refs)
        self.assertEqual(len(captured), 2)
        self.assertNotIn("DISTINCT", " ".join(q["sql"] for q in captured).upper())

    def test_a_page_counts_once_per_reader(self):
        canvas = builder_action(self.org, "canvas.create", {"name": "Map"}, record=self.taco)
        other = builder_action(self.org, "segment.create", {"name": "S"})
        page = bulk.Bulk([canvas, other])
        self.assertEqual(page.people_count(self.other, canvas.pk), 3)
        self.assertEqual(page.people_count(self.csm, canvas.pk), 2)
        self.assertIsNone(page.people_count(self.csm, other.pk))
        with CaptureQueriesContext(connection) as captured:
            page.people_count(self.csm, canvas.pk)
        self.assertEqual(len(captured), 0)
