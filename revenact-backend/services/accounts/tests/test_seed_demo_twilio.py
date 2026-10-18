"""seed_demo_twilio (guided agent spec §6): Alfred only, anchored on Tushar's
own workspace, a dry run unless --apply, and idempotent; an existing Twilio
contact keeps its address; Tushar always owns Twilio."""

from datetime import timedelta
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from services.accounts.models import Organisation, User
from services.customers.models import Call, Contact, Customer, Email, HealthSnapshot, Ticket


def seed(*args, err=None):
    out = StringIO()
    call_command("seed_demo_twilio", *args, stdout=out, stderr=err or StringIO())
    return out.getvalue()


class SeedDemoTwilioTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organisation.objects.create(name="Alfred")
        cls.tushar = User.objects.create_user(
            email="tushar@tryalfred.onworkspace.com",
            password="not-a-real-password-x1",
            name="Tushar",
            organisation=cls.org,
        )
        cls.twilio = Customer.objects.create(
            organisation=cls.org, name="Twilio", health_score=Decimal("5.5")
        )

    def counts(self):
        return (
            Ticket.objects.filter(customer=self.twilio).count(),
            Call.objects.filter(customer=self.twilio).count(),
            HealthSnapshot.objects.filter(customer=self.twilio).count(),
            Contact.objects.filter(customer=self.twilio).count(),
            Email.objects.filter(customer=self.twilio).count(),
        )

    def test_a_dry_run_writes_nothing_and_says_what_it_would(self):
        out = seed()
        self.assertIn("would write tickets: 3 new, 0 updated", out)
        self.assertIn("Dry run", out)
        self.assertEqual(self.counts(), (0, 0, 0, 0, 0))

    def test_apply_seeds_the_demo_once(self):
        seed("--apply")
        seed("--apply")
        self.assertEqual(self.counts(), (3, 1, 5, 1, 1))
        today = timezone.localdate()
        ages = sorted(
            (today - t.opened_at).days for t in Ticket.objects.filter(customer=self.twilio)
        )
        self.assertEqual(ages, [2, 5, 9])
        self.twilio.refresh_from_db()
        self.assertEqual(self.twilio.health_score, Decimal("6.1"))
        self.assertEqual(self.twilio.owner_id, self.tushar.pk)
        oldest = HealthSnapshot.objects.filter(customer=self.twilio).first()
        self.assertEqual(
            (oldest.captured_on, oldest.health_score), (today - timedelta(days=14), Decimal("7.8"))
        )
        champion = Contact.objects.get(customer=self.twilio)
        self.assertEqual((champion.role, champion.email), ("champion", "dana.smith@twilio.example"))
        reply = Email.objects.get(customer=self.twilio)
        self.assertEqual((timezone.now() - reply.sent_at).days, 14)
        self.assertIsNone(reply.mailbox_owner_id)

    def test_an_existing_contact_is_reused_with_its_address(self):
        kept = Contact.objects.create(
            customer=self.twilio, name="Sam Rivera", email="sam@example.com", role="other"
        )
        seed("--apply")
        kept.refresh_from_db()
        self.assertEqual((kept.role, kept.email), ("champion", "sam@example.com"))
        self.assertEqual(Contact.objects.filter(customer=self.twilio).count(), 1)

    def test_any_other_workspace_is_refused(self):
        Organisation.objects.create(name="Acme Inc")
        with self.assertRaisesMessage(CommandError, "only in Alfred"):
            seed("--org", "Acme Inc", "--apply")
        self.assertEqual(self.counts(), (0, 0, 0, 0, 0))

    def test_it_seeds_the_alfred_tushar_is_in_not_another_named_alfred(self):
        # The first Alfred (what a name lookup picks) no longer holds Tushar.
        his = Organisation.objects.create(name="Alfred")
        User.objects.filter(pk=self.tushar.pk).update(organisation=his)
        his_twilio = Customer.objects.create(organisation=his, name="Twilio")
        seed("--apply")
        self.assertEqual(Ticket.objects.filter(customer=his_twilio).count(), 3)
        self.assertFalse(Ticket.objects.filter(customer=self.twilio).exists())
        his_twilio.refresh_from_db()
        self.assertEqual(his_twilio.owner_id, self.tushar.pk)

    def test_tushar_in_another_workspace_is_refused(self):
        other = Organisation.objects.create(name="Acme Inc")
        User.objects.filter(pk=self.tushar.pk).update(organisation=other)
        with self.assertRaisesMessage(CommandError, "not Alfred"):
            seed("--apply")
        self.assertEqual(self.counts(), (0, 0, 0, 0, 0))

    def test_an_inactive_tushar_is_refused(self):
        User.objects.filter(pk=self.tushar.pk).update(is_active=False)
        with self.assertRaisesMessage(CommandError, "no active"):
            seed("--apply")

    def test_two_twilios_are_refused_with_the_count(self):
        Customer.objects.create(organisation=self.org, name="Twilio")
        with self.assertRaisesMessage(CommandError, "has 2 customers named Twilio"):
            seed("--apply")
        self.assertFalse(Ticket.objects.exists())

    def test_tushar_is_made_the_owner_even_when_someone_else_owns_it(self):
        mona = User.objects.create_user(
            email="mona@tryalfred.onworkspace.com",
            password="not-a-real-password-x1",
            name="Mona",
            organisation=self.org,
        )
        Customer.objects.filter(pk=self.twilio.pk).update(owner=mona)
        seed("--apply")
        self.twilio.refresh_from_db()
        self.assertEqual(self.twilio.owner_id, self.tushar.pk)

    def test_the_summary_goes_to_stdout_and_stderr(self):
        err = StringIO()
        out = seed("--apply", err=err)
        line = (
            f"seed_demo_twilio: applied on Alfred (org {self.org.pk}), Twilio "
            f"(customer {self.twilio.pk}): 3 open TW tickets, "
            "owner tushar@tryalfred.onworkspace.com"
        )
        self.assertIn(line, out)
        self.assertIn(line, err.getvalue())
        err = StringIO()
        self.assertIn("dry run on Alfred", seed(err=err))
        self.assertIn("dry run on Alfred", err.getvalue())

    def test_apply_fails_when_the_rows_are_not_there_after(self):
        from unittest.mock import patch

        from services.accounts.management.commands import seed_demo_twilio

        with patch.object(seed_demo_twilio.Command, "_check", return_value=(2, self.tushar.pk)):
            err = StringIO()
            with self.assertRaisesMessage(CommandError, "isn't seeded as expected"):
                seed("--apply", err=err)
        self.assertIn("FAILED", err.getvalue())

    def test_no_twilio_no_seed(self):
        Customer.objects.filter(pk=self.twilio.pk).update(name="Twilio Old")
        with self.assertRaisesMessage(CommandError, "run seed_alfee first"):
            seed("--apply")
