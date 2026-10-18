"""seed_demo_sales_review (sales review report spec §6): Alfred only, a dry
run unless --apply, idempotent, and the proposal made at once."""

from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from services.accounts.models import Organisation, User
from services.agents.models import AgentBundle
from services.calendar.models import Meeting
from services.customers.models import Customer, Opportunity

EMAIL = "tushar@tryalfred.onworkspace.com"


def seed(*args):
    out, err = StringIO(), StringIO()
    call_command("seed_demo_sales_review", *args, stdout=out, stderr=err)
    return out.getvalue(), err.getvalue()


class SeedDemoSalesReviewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organisation.objects.create(name="Alfred")
        cls.tushar = User.objects.create_user(
            email=EMAIL,
            password="not-a-real-password-x1",
            name="Tushar",
            organisation=cls.org,
            role=User.Role.ADMIN,
            function=User.Function.SALES,
        )
        for name in ("Twilio", "Stripe", "Notion"):
            Customer.objects.create(
                organisation=cls.org, name=name, owner=cls.tushar, health_score=Decimal("7.0")
            )

    def setUp(self):
        from services.mail.tests.gmail_fixtures import google_connection

        google_connection(self.tushar)

    def test_a_dry_run_writes_nothing(self):
        out, err = seed()
        self.assertIn("would write deals: 12 new, 0 updated", out)
        self.assertIn("would write meeting: 1 new", out)
        self.assertIn("would write deals", err)
        self.assertIn("Dry run", out)
        self.assertFalse(Opportunity.objects.exists())
        self.assertFalse(Meeting.objects.exists())

    def test_apply_seeds_the_demo_once_and_makes_the_proposal(self):
        out, _err = seed("--apply")
        self.assertIn("wrote report bundles: 1 made", out)
        self.assertEqual(Opportunity.objects.count(), 12)
        meeting = Meeting.objects.get()
        self.assertEqual(meeting.title, "Sales review")
        self.assertTrue(meeting.google_event_id.startswith("revenact-demo-sales-review-"))
        bundle = AgentBundle.objects.get(source=AgentBundle.Source.MEETING)
        self.assertEqual(bundle.routed_user_id, self.tushar.pk)
        out, _err = seed("--apply")
        self.assertIn("wrote deals: 0 new, 12 updated", out)
        self.assertIn("0 made, 1 already there", out)
        self.assertEqual((Opportunity.objects.count(), Meeting.objects.count()), (12, 1))
        self.assertEqual(AgentBundle.objects.filter(source="meeting").count(), 1)

    def test_another_workspace_is_refused(self):
        Organisation.objects.filter(pk=self.org.pk).update(name="Acme")
        with self.assertRaisesMessage(CommandError, "only in Alfred"):
            seed("--apply")
        self.assertFalse(Opportunity.objects.exists())
