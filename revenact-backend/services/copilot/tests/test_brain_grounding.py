"""What an answer on the Brain is grounded in: the tab the asker is on, built
by the page's own code for their scope, one line for each other tab, and the
scope's readable brief. Nothing the asker can't open is named."""

from datetime import timedelta
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import serializers

from services.brain import waiting
from services.brain.scope import ME, resolve
from services.copilot.brain_context import NOT_YOUR_VIEW
from services.copilot.brain_grounding import BRAIN_PERSONA, brain_system_prompt
from services.metrics.models import Brief

from .brain_fixture import BrainAskFixture

EMPTY = {"account_ids": [], "departments": []}


class PageFiguresTests(BrainAskFixture):
    """Every figure is the page's own for the same person and scope."""

    def page(self, user, tab, scope="me"):
        return self.as_user(user).get(f"/api/v1/brain/{tab}/?scope={scope}").json()

    def test_what_changed_carries_the_pages_metrics(self):
        # Asked from the page: its view wrote the first-view baseline.
        arr = next(m for m in self.page(self.csm, "changed")["metrics"] if m["key"] == "active_arr")
        summary = self.ground(self.csm, "me", "changed").summary

        self.assertEqual(arr["now"], 400_000.0)
        self.assertIn(f"- ARR: USD {arr['now']:,.0f}; USD {arr['then']:,.0f}; unchanged", summary)
        self.assertIn("Screen: Brain › What changed", summary)
        self.assertIn("Scope: Me — this part of the organisation's book only", summary)
        self.assertIn("MATERIAL MOVES:\n- none", summary)

    def test_waiting_carries_the_pages_items_and_counts(self):
        self.task(self.csm, customer=self.pizza)

        summary = self.ground(self.csm, "me", "waiting").summary

        [item] = waiting.build(self.csm, resolve(self.csm, ME), timezone.localdate())["items"]
        self.assertIn(
            "Counts: 0 rule reviews, 0 agent actions, 0 questions, 1 overdue task.", summary
        )
        self.assertIn(
            f"- Overdue task: Call the exec sponsor, waiting since {item['since'][:10]} on "
            "Carl CSM, about Pizza Hut (organisation); the asker can act on it",
            summary,
        )

    def test_doing_carries_the_pages_plans(self):
        self.plan(self.pizza, status="at_risk", milestones=(True, False))

        summary = self.ground(self.csm, "me", "doing").summary

        [plan] = self.page(self.csm, "doing")["plans"]
        self.assertIn("PLANS (1 open plan, 1 at risk):", summary)
        self.assertIn(
            f"- Renewal save play on Pizza Hut (organisation): At risk, target "
            f"{plan['target_date']}, milestones 1 of 2 done, owner Carl CSM; health now "
            f"{plan['now']['health_score']:g}, ARR now USD {plan['now']['arr']:,.0f}",
            summary,
        )

    def test_customers_carries_the_pages_asks(self):
        self.feature("SSO", self.pizza, self.emea)

        summary = self.ground(self.csm, "me", "customers").summary

        asks = self.page(self.csm, "customers")["asks"]
        [top] = asks["top"]
        companies = "1 company" if top["companies"] == 1 else f"{top['companies']} companies"
        self.assertIn(f"ASKS ({asks['total']} ask in all; the top 1 by revenue):", summary)
        self.assertIn(
            f"- SSO (open): USD {top['arr']:,.0f} ARR across {companies}; "
            f"{top['last_90_days']} in the last 90 days, {top['previous_90_days']} the 90 before",
            summary,
        )

    def test_the_figures_follow_the_scope(self):
        summary = self.ground(self.mona, "team", "changed").summary

        self.assertIn("Scope: My team", summary)
        self.assertIn("- ARR: USD 450,000;", summary)


class HiddenRecordTests(BrainAskFixture):
    """Lee reads Company through Leadership and can open only Loose Ltd."""

    def setUp(self):
        nps = self.send("nps")
        self.answer(nps, self.pizza, 4, comment="Support is slow lately.")
        self.answer(nps, self.loose, 9, comment="Lovely team.")
        self.turned(self.contact(self.pizza, "Olivia Pizza"), "neutral")
        self.plan(self.pizza, name="Pizza save play")
        self.task(self.csm, customer=self.pizza, title="Call the Pizza sponsor")

    def test_a_record_the_asker_cannot_open_never_reaches_the_prompt(self):
        for tab in ("changed", "waiting", "doing", "customers"):
            with self.subTest(tab=tab):
                grounding = self.ground(self.lee, "company", tab)
                for hidden in (
                    "Pizza Hut",
                    "Olivia",
                    "Support is slow lately.",
                    "Pizza save play",
                    "Call the Pizza sponsor",
                ):
                    self.assertNotIn(hidden, grounding.summary)
                self.assertNotIn(self.pizza.pk, grounding.customer_ids)

    def test_hidden_records_are_counted_where_the_payload_counts_them(self):
        customers = self.ground(self.lee, "company", "customers")
        self.assertIn("Lovely team.", customers.summary)
        self.assertIn("Comments: 1 more on records you can't open.", customers.summary)
        self.assertEqual(customers.customer_ids, [self.loose.pk])

        doing = self.ground(self.lee, "company", "doing")
        self.assertIn("Plans: 1 more on records you can't open.", doing.summary)

        waiting = self.ground(self.lee, "company", "waiting")
        self.assertIn("Waiting: 1 more waiting item you can't open.", waiting.summary)
        self.assertNotIn("Waiting: 1 more on records", waiting.summary)
        summary = self.ground(self.lee, "company", "changed").summary
        self.assertIn("; 1 more waiting item you can't open.", summary)

    def test_a_hidden_customers_id_never_reaches_any_tab_or_summary(self):
        hidden = self.customer("Quiet Holdings", self.csm, 70_000, "2.0", pk=987654)
        nps = self.send("nps")
        self.answer(nps, hidden, 3, comment="Quiet complaint.")
        self.turned(self.contact(hidden, "Quentin Quiet"), "neutral")
        self.plan(hidden, name="Quiet save play")
        self.task(self.csm, customer=hidden, title="Call Quiet Holdings")

        for tab in ("changed", "waiting", "doing", "customers"):
            with self.subTest(tab=tab):
                grounding = self.ground(self.lee, "company", tab)
                for leaked in ("987654", "Quiet"):
                    self.assertNotIn(leaked, grounding.summary)
                self.assertNotIn(987654, grounding.customer_ids)
        # The control: the same records reach a reader who may open them.
        self.assertIn("Quiet save play", self.ground(self.admin, "company", "doing").summary)

    def test_the_hidden_records_are_named_to_a_reader_who_can_open_them(self):
        # The control that makes the test above prove something: the same
        # records, built the same way, do reach the prompt of a reader who
        # may open them, by name and in customer_ids.
        customers = self.ground(self.admin, "company", "customers")
        for shown in ("Pizza Hut", "Olivia", "Support is slow lately."):
            self.assertIn(shown, customers.summary)
        self.assertIn(self.pizza.pk, customers.customer_ids)

        doing = self.ground(self.admin, "company", "doing")
        self.assertIn("Pizza save play", doing.summary)
        self.assertIn(self.pizza.pk, doing.customer_ids)

        waiting = self.ground(self.csm, "me", "waiting")
        self.assertIn("Call the Pizza sponsor", waiting.summary)
        self.assertIn(self.pizza.pk, waiting.customer_ids)


class OtherTabsTests(BrainAskFixture):
    def test_each_other_tab_is_one_summary_line(self):
        self.initiative(self.csm, cut=self.csm)
        self.plan(self.dough, status="at_risk")
        self.night(self.rule(self.csm), fired=2)

        summary = self.ground(self.csm, "me", "changed").summary

        self.assertIn("THE OTHER TABS:", summary)
        self.assertIn(
            "Waiting: 0 rule reviews, 0 agent actions, 0 questions, 0 overdue tasks.", summary
        )
        self.assertIn(
            "What's being done: 0 of 1 active initiative on track; 1 open plan, 1 at risk; "
            "1 rule running, 2 fired last night.",
            summary,
        )
        self.assertIn(
            "Customers: 0 asks, 0 anomalies; NPS not enough answers, CSAT not enough answers; "
            "0 negative contacts.",
            summary,
        )
        self.assertNotIn("What changed: ", summary)

    def test_what_changed_summarises_the_four_headline_metrics(self):
        self.as_user(self.csm).get("/api/v1/brain/changed/?scope=me")
        summary = self.ground(self.csm, "me", "customers").summary

        line = next(row for row in summary.splitlines() if row.startswith("What changed: "))
        self.assertTrue(line.startswith("What changed: ARR USD 400,000 (unchanged); "), line)
        for label in ("Net revenue retention", "ARR at risk", "Book in good health"):
            self.assertIn(label, line)


class SnapshotTests(BrainAskFixture):
    def test_customer_ids_cover_every_customer_the_tab_names(self):
        self.task(self.csm, customer=self.pizza)
        self.plan(self.dough)
        nps = self.send("nps")
        self.answer(nps, self.dough, 4, comment="Renewal is shaky.")
        self.turned(self.contact(self.pizza, "Paula Pizza"), "neutral")

        # What changed names Dough Co, the account carrying Carl's downside.
        self.assertEqual(self.ground(self.csm, "me", "changed").customer_ids, [self.dough.pk])
        self.assertEqual(self.ground(self.csm, "me", "waiting").customer_ids, [self.pizza.pk])
        self.assertEqual(self.ground(self.csm, "me", "doing").customer_ids, [self.dough.pk])
        self.assertEqual(
            self.ground(self.csm, "me", "customers").customer_ids,
            sorted([self.pizza.pk, self.dough.pk]),
        )

    def test_the_other_snapshots_are_empty(self):
        grounding = self.ground(self.csm, "me", "waiting")

        self.assertEqual(grounding.sources, [])
        self.assertIsNone(grounding.company)
        self.assertEqual(grounding.records, [])
        self.assertEqual(grounding.pipeline, EMPTY)
        self.assertEqual(grounding.tickets, EMPTY)

    def brief(self, generated_by):
        return Brief.objects.create(
            organisation=self.org,
            as_of=self.today,
            headline="Pizza Hut carries the risk",
            body="First paragraph.\n\nSecond paragraph.",
            watch=[],
            evidence={"customer_ids": [self.pizza.pk]},
            generated_by=generated_by,
            generated_at=timezone.now() - timedelta(hours=1),
            scope_key=f"me:{self.csm.pk}",
        )

    def test_the_readable_brief_is_added_with_its_customers(self):
        self.brief(self.csm)

        grounding = self.ground(self.csm, "me", "waiting")

        self.assertIn("Headline: Pizza Hut carries the risk", grounding.summary)
        self.assertIn("First paragraph.\nSecond paragraph.", grounding.summary)
        self.assertEqual(grounding.customer_ids, [self.pizza.pk])

    def test_a_brief_the_asker_may_not_read_is_left_out(self):
        # Written by someone else: `payloads.first_readable` shows a brief
        # naming customers only to its writer or a reader who sees everything.
        self.brief(self.admin)

        grounding = self.ground(self.csm, "me", "waiting")

        self.assertNotIn("Headline:", grounding.summary)
        self.assertEqual(grounding.customer_ids, [])


class RefusalTests(BrainAskFixture):
    def test_a_scope_the_asker_lost_is_the_context_400(self):
        with self.assertRaises(serializers.ValidationError) as caught:
            self.ground(self.csm, "team", "changed")

        self.assertEqual(caught.exception.detail, {"context": {"scope": [NOT_YOUR_VIEW]}})


class PromptTests(BrainAskFixture):
    def test_the_digest_is_fenced_as_data_under_the_brain_persona(self):
        system = brain_system_prompt("Be brief.", "Screen: Brain › What changed")

        self.assertTrue(system.startswith(BRAIN_PERSONA))
        self.assertIn("Be brief.", system)
        self.assertIn("Brain data:\n<dashboard_data>\nScreen: Brain › What changed", system)
        for rule in ("not in this view", "Name customers only as the data names them"):
            self.assertIn(rule, BRAIN_PERSONA)


class QueryCountTests(BrainAskFixture):
    """A grounding costs a fixed number of queries whatever the length of
    each section. DISTINCT is not asserted here: initiative progress reads
    the metric registry, whose forecast rollup legitimately de-duplicates the
    Opportunity/Risk-to-Account M2M (services/brain/doing.py docstring). This
    module adds no query of its own."""

    def fill(self, n):
        nps = self.send("nps")
        for i in range(n):
            self.feature(f"Ask {i}", self.pizza, self.emea)
            self.anomaly(f"Outage {i}", self.pizza, self.emea)
            self.answer(nps, self.pizza, 3, comment=f"Slow {i}")
            self.turned(self.contact(self.pizza, f"Person {i}"), "neutral")
            self.task(self.csm, customer=self.pizza, title=f"Call {i}")
            self.question(self.csm, customer=self.pizza, text=f"Who signs {i}?")
            self.initiative(self.csm, cut=self.csm, title=f"Initiative {i}")
            self.plan(self.pizza, name=f"Plan {i}")
            self.night(self.rule(self.csm, name=f"Rule {i}"), fired=1, records=(self.pizza,))

    def queries(self):
        with CaptureQueriesContext(connection) as captured:
            self.ground(self.mona, "team", "customers")
        return len(captured.captured_queries)

    def test_the_query_count_does_not_grow_with_the_items(self):
        # The first view of My team writes its baseline; measure after it.
        self.ground(self.mona, "team", "customers")
        self.fill(1)
        few = self.queries()
        self.fill(5)
        many = self.queries()

        self.assertEqual(few, many)


class RuleAndBaselineTests(BrainAskFixture):
    def test_a_rule_the_asker_cannot_open_is_marked(self):
        self.night(self.rule(self.csm, name="Carl private rule"), fired=1)
        self.night(self.rule(self.csm, name="Carl shared rule", sharing="workspace"), fired=1)

        summary = self.ground(self.mona, "team", "doing").summary

        private = next(row for row in summary.splitlines() if "Carl private rule" in row)
        shared = next(row for row in summary.splitlines() if "Carl shared rule" in row)
        self.assertIn("(the asker can't open it)", private)
        self.assertNotIn("(the asker can't open it)", shared)

    def test_asking_writes_no_scope_baseline(self):
        from services.brain.models import ScopeSnapshot

        for scope, user in (("me", self.csm), ("team", self.mona)):
            for tab in ("changed", "waiting"):
                with self.subTest(scope=scope, tab=tab):
                    summary = self.ground(user, scope, tab).summary
                    self.assertFalse(ScopeSnapshot.objects.exists())
                    self.assertIn("no comparison", summary)

    def test_customer_ids_are_cut_like_the_lists(self):
        from services.copilot import brain_grounding

        nps = self.send("nps")
        self.answer(nps, self.pizza, 4, comment="Slow.")
        self.answer(nps, self.dough, 4, comment="Shaky.", days_ago=2)
        self.turned(self.contact(self.pizza, "Paula Pizza"), "neutral")
        self.turned(self.contact(self.dough, "Dora Dough"), "neutral", days_ago=2)

        with patch.object(brain_grounding, "LIST_LIMIT", 1):
            grounding = self.ground(self.csm, "me", "customers")

        self.assertNotIn("Dough Co", grounding.summary)
        self.assertEqual(grounding.customer_ids, [self.pizza.pk])
