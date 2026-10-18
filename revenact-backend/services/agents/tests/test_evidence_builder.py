"""What the Ops agent builds from (contract): the workspace's shared segments
and templates by name and kind, never a private or person-shared one, its
products, and the AI attributes' api names; the CS agent sees none of it."""

from services.accounts.models import Organisation
from services.agents import evidence, prompt
from services.agents.tests.fixtures import AgentsFixture
from services.attributes.models import AIAttribute
from services.customers.models import Product
from services.plans.models import PlanTemplate
from services.segments.models import Segment


class OpsBuilderEvidenceTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        made = {"organisation": cls.org, "owner": cls.admin, "kind": "customer"}
        cls.shared = Segment.objects.create(name='At "risk"', sharing="workspace", **made)
        cls.private = Segment.objects.create(name="Mine only", **made)
        cls.named = Segment.objects.create(name="For Carl", sharing="people", **made)
        milestones = [{"name": "Call", "offset_days": 0, "tasks": []}]
        common = {"organisation": cls.org, "owner": cls.admin, "kind": "save"}
        cls.workspace_template = PlanTemplate.objects.create(
            name="Shared save", sharing="workspace", milestones=milestones, **common
        )
        cls.private_template = PlanTemplate.objects.create(
            name="Private save", milestones=milestones, **common
        )
        cls.product = Product.objects.create(organisation=cls.org, name="Product B")
        cls.tier = AIAttribute.objects.create(
            organisation=cls.org, name="Tier", api_name="tier", prompt="p", value_type="text"
        )

    def ctx(self, agent):
        return evidence.build(Organisation.objects.get(pk=self.org.pk), agent, today=self.today)

    def test_ops_sees_only_what_the_whole_workspace_shares(self):
        ctx = self.ctx("ops")
        self.assertEqual(
            ctx.segments,
            {self.shared.pk: {"id": self.shared.pk, "name": 'At "risk"', "kind": "customer"}},
        )
        self.assertIn(self.workspace_template.pk, ctx.templates)
        self.assertNotIn(self.private_template.pk, ctx.templates)
        self.assertEqual(ctx.products, {self.product.pk: "Product B"})
        self.assertEqual(ctx.attributes[self.tier.pk]["api_name"], "tier")
        text = prompt.render(ctx)
        self.assertIn("Shared segments:", text)
        self.assertIn(f'  segment {self.shared.pk}: "At \\"risk\\"" (customer)', text)
        self.assertNotIn("Mine only", text)
        self.assertNotIn("For Carl", text)
        self.assertNotIn("Private save", text)

    def test_cs_sees_no_segments_or_products(self):
        ctx = self.ctx("cs")
        self.assertEqual((ctx.segments, ctx.products), ({}, {}))
        self.assertNotIn("Shared segments:", prompt.render(ctx))


class CatalogueTests(OpsBuilderEvidenceTests):
    def test_the_ops_prompt_carries_the_catalogue(self):
        text = prompt.render(self.ctx("ops"))
        self.assertIn("\nBUILDER CATALOGUE:", text)
        for wanted in (
            "- segment kinds: customer (organisations), account (accounts), contact (contacts)",
            "health_category choice (good|average|poor)",
            "nps_band choice (promoter|passive|detractor)",
            "- operators: number gt|lt|between|is_empty|is_not_empty;",
            'attr:tier text, options "-"',
            f'- products (id: name): {self.product.pk}: "Product B"',
            '"score": "csat"|"nps"|"ces"|"health"',
            "health 0-10",
            '{"action": "survey", "survey_type": "nps"|"csat"|"ces"',
            "- contact roles: executive_sponsor, champion, economic_buyer",
            "- campaign merge fields: {first_name}, {organisation}, {sender_name}",
            "- template kinds: onboarding, success, save, qbr, other; at most 4 milestones",
        ):
            self.assertIn(wanted, text)

    def test_the_cs_prompt_has_no_catalogue(self):
        self.assertNotIn("BUILDER CATALOGUE", prompt.render(self.ctx("cs")))


class NamingAndPromptTests(AgentsFixture):
    def test_a_workspace_object_names_no_record(self):
        ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "ops", today=self.today)
        self.assertTrue(evidence.record_mentions(ctx, ["Win back Pizza Hut"]))
        self.assertFalse(evidence.record_mentions(ctx, ["Win back pizzas"]))
        ctx.figures = {"accounts": [{"name": "Globex Corp"}]}
        self.assertTrue(evidence.record_mentions(ctx, [None, "Save globex corp now"]))

    def test_the_system_prompt_states_the_builder_rules(self):
        kinds = ["segment.create", "scenario.create", "campaign.create", "plan.template"]
        text = prompt.system("ops", [*kinds, "canvas.create"], "plain")
        for kind in (*kinds, "canvas.create"):
            self.assertIn(f"  - {kind}: ", text)
        self.assertIn("or null for a workspace-level kind", text)
        self.assertIn("at most one of segment.create, scenario.create", text)
        self.assertIn("{first_name}, {organisation} and {sender_name}", text)
        self.assertIn("A canvas.create cites its record's people line.", text)
