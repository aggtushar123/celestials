from io import StringIO
from unittest.mock import patch

from django.core.management import CommandError, call_command
from django.test import TestCase

from services.accounts.models import Organisation, User
from services.customers.models import Customer
from services.identity.models import OrganizationDomain
from services.knowledge.models import Contribution, FunctionOwner

PASSWORD = "judges-only-pass-1"
WORKSPACE = "tryalfred.onworkspace.com"


def seed_alfee(password=PASSWORD):
    out, err = StringIO(), StringIO()
    with patch.dict("os.environ", {"ALFEE_DEMO_PASSWORD": password}):
        call_command("seed_alfee", stdout=out, stderr=err)
    return out.getvalue(), err.getvalue()


class SeedAlfeeTests(TestCase):
    def test_refuses_without_a_long_enough_password(self):
        for password in ("", "short"):
            with self.subTest(password=password), self.assertRaises(CommandError):
                seed_alfee(password)
        self.assertFalse(Organisation.objects.filter(name="Alfred").exists())

    def test_seeds_the_whole_book_with_the_alfred_people(self):
        _, err = seed_alfee()
        self.assertNotIn("failed", err, err)

        org = Organisation.objects.get(name="Alfred")
        people = {u.email: u for u in User.objects.filter(organisation=org)}
        self.assertEqual(
            set(people),
            {f"{p}@{WORKSPACE}" for p in ("tushar", "faiz", "jesh")}
            | {f"{p}@alfee.io" for p in ("priya", "raj", "mei")},
        )
        tushar, faiz, jesh = (people[f"{p}@{WORKSPACE}"] for p in ("tushar", "faiz", "jesh"))
        self.assertEqual(
            (tushar.role.slug, tushar.function), (User.Role.ADMIN, User.Function.LEADERSHIP)
        )
        self.assertEqual((faiz.role.slug, jesh.role.slug), (User.Role.CSM, User.Role.CSM))
        self.assertEqual((faiz.function, jesh.function), (User.Function.CS, User.Function.CS))
        self.assertEqual(
            (faiz.reports_to, jesh.reports_to, tushar.reports_to), (tushar, tushar, None)
        )
        for user in people.values():
            self.assertTrue(user.check_password(PASSWORD), user.email)

        customers = Customer.objects.filter(organisation=org)
        self.assertGreater(customers.count(), 5)
        self.assertTrue(customers.filter(owner=faiz).exists())
        self.assertTrue(customers.filter(owner=jesh).exists())
        self.assertTrue(FunctionOwner.objects.filter(customer__organisation=org).exists())
        self.assertGreater(Contribution.objects.filter(organisation=org).count(), 5)
        self.assertFalse(User.objects.filter(email__endswith="@acme.io").exists())

    def test_runs_again_without_duplicating(self):
        seed_alfee()
        before = (Customer.objects.count(), Contribution.objects.count(), User.objects.count())
        seed_alfee()
        after = (Customer.objects.count(), Contribution.objects.count(), User.objects.count())
        self.assertEqual(before, after)

    def test_the_workspace_domain_waits_for_staff_verification(self):
        seed_alfee()
        seed_alfee()
        domain = OrganizationDomain.objects.get(domain=WORKSPACE)
        self.assertEqual(domain.organisation.name, "Alfred")
        self.assertEqual(domain.verification_status, OrganizationDomain.VerificationStatus.PENDING)
        self.assertTrue(domain.verification_token)

    def test_moves_an_existing_alfee_workspace_in_place(self):
        """Production already holds Alfee: rename it, never seed a second book."""
        org = Organisation.objects.create(name="Alfee")
        old = User.objects.create_user(
            email="tushar@alfee.io", password=PASSWORD, name="Tushar", organisation=org
        )
        out, err = seed_alfee()
        self.assertNotIn("failed", err, err)

        org.refresh_from_db()
        old.refresh_from_db()
        self.assertEqual(org.name, "Alfred")
        self.assertEqual(old.email, f"tushar@{WORKSPACE}")
        self.assertFalse(Organisation.objects.filter(name="Alfee").exists())
        self.assertEqual(Organisation.objects.filter(name="Alfred").count(), 1)
        self.assertIn("renamed Alfee to Alfred", out)
        self.assertIn(f"tushar@alfee.io is now tushar@{WORKSPACE}", out)

    def test_acme_and_alfee_live_side_by_side(self):
        call_command("seed_demo", stdout=StringIO(), stderr=StringIO())
        seed_alfee()
        acme, alfee = (
            Organisation.objects.get(name="Acme Inc"),
            Organisation.objects.get(name="Alfred"),
        )
        self.assertEqual(User.objects.get(email="dana@acme.io").reports_to.email, "carl@acme.io")
        self.assertTrue(User.objects.get(email="alice@acme.io").check_password("supersecret1"))
        self.assertFalse(
            User.objects.filter(organisation=acme, email__endswith="@alfee.io").exists()
        )
        self.assertFalse(
            User.objects.filter(organisation=alfee, email__endswith="@acme.io").exists()
        )
        self.assertEqual(
            Customer.objects.filter(organisation=acme).count(),
            Customer.objects.filter(organisation=alfee).count(),
        )
