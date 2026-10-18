"""Google mailboxes for the Gmail tests, on test_mail.Fixture's world (Dana
reports to Carl, Carl to Alice; Pizza Hut is pizzahut.com). The workspace
is switched on for Gmail and acme.io is verified. Credentials are fake
values; every test that reaches Google patches it (gmail_fake.FakeGmail)."""

from unittest.mock import patch

from services.identity.models import OrganizationDomain
from services.mail import scopes
from services.mail.models import MailboxConnection

from .test_mail import Fixture

#: What Google grants when every box on the consent screen is left ticked.
GRANTED = [
    *scopes.TWO_WAY,
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]
CREDENTIALS = {"access_token": "fake-access", "refresh_token": "fake-refresh", "expires_at": 9e12}


def google_connection(user, address=None, **fields):
    """`user`'s Google mailbox, two-way and connected; `fields` override."""
    values = {
        "organisation": user.organisation,
        "provider": MailboxConnection.Provider.GOOGLE,
        "address": address or user.email,
        "display_name": user.name,
        "credentials": "",
        "granted_scopes": list(GRANTED),
    }
    values.update(fields)
    connection = MailboxConnection.objects.create(user=user, **values)
    connection.set_credentials(dict(CREDENTIALS))
    connection.save(update_fields=["credentials"])
    return connection


class GmailFixture(Fixture):
    def setUp(self):
        super().setUp()
        self.org.gmail_two_way_enabled = True
        self.org.save(update_fields=["gmail_two_way_enabled"])
        OrganizationDomain.objects.create(
            organisation=self.org,
            domain="acme.io",
            verification_status=OrganizationDomain.VerificationStatus.VERIFIED,
        )

    def google(self, user, address=None, **fields):
        return google_connection(user, address, **fields)

    def use_gmail(self, address="dana@acme.io"):
        """A FakeGmail standing in for Google for the rest of this test: both
        transports (JSON calls and D3's uploads)."""
        from .gmail_fake import FakeGmail

        fake = FakeGmail(address)
        for target, stand_in in (
            ("services.mail.providers.google.http_json", fake),
            ("services.mail.providers.google.http_upload", fake.upload),
        ):
            patcher = patch(target, stand_in)
            patcher.start()
            self.addCleanup(patcher.stop)
        return fake
