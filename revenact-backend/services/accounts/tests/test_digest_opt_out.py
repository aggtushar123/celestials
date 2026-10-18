"""A person's own switch for Work's daily digest (spec §3.1): on their own
profile only, in the API now, in account settings later."""

from rest_framework.test import APITestCase

from services.accounts.models import Organisation, User

ME = "/api/v1/auth/me/"


class DigestOptOutTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organisation.objects.create(name="Acme Inc", currency="USD")
        cls.user = User.objects.create_user(
            email="carl@acme.io", password="pw-123456789", name="Carl CSM", organisation=cls.org
        )

    def setUp(self):
        self.client.force_authenticate(self.user)

    def test_it_defaults_to_off_and_is_on_my_profile(self):
        response = self.client.get(ME)
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.data["digest_opt_out"], False)

    def test_i_can_turn_it_on(self):
        response = self.client.patch(ME, {"digest_opt_out": True}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(User.objects.get(pk=self.user.pk).digest_opt_out)
