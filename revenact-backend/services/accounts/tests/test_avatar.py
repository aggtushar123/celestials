"""No third-party avatar (2026-10-17: a made-up pravatar.cc URL per user was
blocked by the CSP on every page and sent each email to a third party)."""

from django.test import TestCase
from rest_framework.test import APIClient

from services.accounts.models import Organisation, User


class AvatarTests(TestCase):
    def test_me_has_no_third_party_avatar(self):
        org = Organisation.objects.create(name="Acme Inc")
        user = User.objects.create_user(
            email="alice@acme.io", password="x", name="Alice", organisation=org
        )
        client = APIClient()
        client.force_authenticate(user)
        body = client.get("/api/v1/auth/me/").json()
        self.assertEqual(body["avatar"], "")
        self.assertNotIn("pravatar", str(body))
