"""Owner-only mail and Add to Revenact (spec 2026-10-17-private-mail-and-email-agent-design §1).

Defended: a person's mail is theirs alone, not their manager's; legacy
(logged) mail stays visible; a deleted person's synced mail is nobody's.
Adding a thread to Revenact shares every filed message of it in the owner's
mailbox with whoever can open the customer, and Remove takes it back. Only
the owner shares. A mailbox message on a customer's people but not filed
yet is filed and shared in one step.
"""

from django.utils import timezone
from rest_framework import status

from core.models import AuditEvent
from services.customers.models import Customer, Email
from services.mail.models import MailMessage
from services.mail.visibility import shareable_emails_q, visible_emails

from .test_mail import NOW, Fixture


class OwnerOnlyTests(Fixture):
    def test_mail_is_its_owners_alone_not_the_managers(self):
        legacy = self.email(None)
        dana = self.email(self.dana)
        for reader, expected in (
            (self.dana, {legacy, dana}),
            (self.carl, {legacy}),
            (self.alice, {legacy}),
        ):
            with self.subTest(reader=reader.name):
                self.assertEqual(set(visible_emails(reader, Email.objects.all())), expected)

    def test_a_deleted_persons_synced_mail_is_nobodys(self):
        orphan = self.email(None, synced_at=timezone.now())
        self.assertFalse(visible_emails(self.carl, Email.objects.filter(pk=orphan.pk)).exists())
        self.assertFalse(Email.objects.filter(shareable_emails_q(), pk=orphan.pk).exists())

    def test_shared_mail_is_read_by_whoever_opens_the_customer(self):
        dana = self.email(self.dana, shared_at=NOW, shared_by=self.dana)
        self.assertTrue(visible_emails(self.priya, Email.objects.filter(pk=dana.pk)).exists())
        other = Customer.objects.create(organisation=self.org, name="Other", owner=self.dana)
        hidden = self.email(self.dana, shared_at=NOW)
        hidden.customer = other
        hidden.save(update_fields=["customer"])
        # Every Fixture person may open Pizza Hut; Other is Dana's alone.
        from services.accounts.models import User

        eve = User.objects.create_user(
            email="eve@acme.io", password="x", name="Eve", organisation=self.org
        )
        self.assertFalse(visible_emails(eve, Email.objects.filter(pk=hidden.pk)).exists())


class ShareTests(Fixture):
    def setUp(self):
        super().setUp()
        self.first = self.email(self.dana, thread_id="t1", subject="Renewal")
        self.second = self.email(self.dana, thread_id="t1", subject="Re: Renewal", direction="sent")
        self.elsewhere = self.email(self.dana, thread_id="t2")

    def url(self, email=None):
        return f"/api/v1/communications/emails/{(email or self.first).pk}/share/"

    def test_the_owner_adds_the_whole_thread_and_removes_it(self):
        self.client.force_authenticate(self.dana)
        response = self.client.post(self.url())
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data, {"shared": True, "count": 2})
        for row in (self.first, self.second):
            row.refresh_from_db()
            self.assertEqual(row.shared_by, self.dana)
        self.elsewhere.refresh_from_db()
        self.assertIsNone(self.elsewhere.shared_at)
        event = AuditEvent.objects.get(action="email.shared")
        self.assertEqual(event.metadata, {"count": 2})
        # Carl (her manager) now reads it, as anyone who opens Pizza Hut does.
        self.assertTrue(visible_emails(self.carl, Email.objects.filter(pk=self.second.pk)).exists())

        response = self.client.delete(self.url())
        self.assertEqual(response.data, {"shared": False, "count": 2})
        self.assertFalse(
            visible_emails(self.carl, Email.objects.filter(pk=self.second.pk)).exists()
        )
        self.assertTrue(AuditEvent.objects.filter(action="email.unshared").exists())

    def test_only_the_owner_shares(self):
        self.client.force_authenticate(self.carl)  # her manager: can't even see it
        self.assertEqual(self.client.post(self.url()).status_code, status.HTTP_404_NOT_FOUND)
        self.first.shared_at = NOW
        self.first.save(update_fields=["shared_at"])
        response = self.client.delete(self.url())  # sees it now, still not his to unshare
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["code"], "NOT_YOURS")

    def test_a_legacy_email_has_no_owner_to_share_it(self):
        legacy = self.email(None)
        self.client.force_authenticate(self.dana)
        response = self.client.post(self.url(legacy))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_the_serializer_says_whether_it_is_shared(self):
        self.client.force_authenticate(self.dana)
        self.client.post(self.url())
        rows = self.client.get(f"/api/v1/customers/{self.pizza.pk}/emails/").data
        rows = rows["results"] if isinstance(rows, dict) else rows
        mine = next(r for r in rows if r["id"] == self.first.pk)
        self.assertIsNotNone(mine["shared_at"])


class ShareMailboxMessageTests(Fixture):
    def setUp(self):
        super().setUp()
        self.connection = self.connect(self.dana)

    def row(self, **kw):
        values = {
            "connection": self.connection,
            "owner": self.dana,
            "organisation": self.org,
            "provider_message_id": "<m1@x.io>",
            "direction": "received",
            "from_name": "Sam",
            "from_address": "sam@pizzahut.com",
            "to": [["Dana", "dana@acme.io"]],
            "subject": "Contract",
            "body": "Let's renew.",
            "thread_id": "th-9",
            "sent_at": NOW,
        }
        values.update(kw)
        return MailMessage.objects.create(**values)

    def test_files_it_on_the_matched_customer_and_shares_it(self):
        row = self.row()
        self.client.force_authenticate(self.dana)
        response = self.client.post(f"/api/v1/mail/messages/{row.pk}/share/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        row.refresh_from_db()
        email = row.email
        self.assertEqual(
            (email.customer, email.mailbox_owner, email.subject),
            (self.pizza, self.dana, "Contract"),
        )
        self.assertIsNotNone(email.shared_at)
        self.assertEqual(response.data["email_id"], email.pk)

    def test_the_detail_says_shared_and_remove_takes_it_back(self):
        row = self.row()
        self.client.force_authenticate(self.dana)
        self.assertFalse(self.client.get(f"/api/v1/mail/messages/{row.pk}/").data["shared"])
        self.client.post(f"/api/v1/mail/messages/{row.pk}/share/")
        self.assertTrue(self.client.get(f"/api/v1/mail/messages/{row.pk}/").data["shared"])
        response = self.client.delete(f"/api/v1/mail/messages/{row.pk}/share/")
        self.assertEqual(response.data["shared"], False)
        self.assertFalse(self.client.get(f"/api/v1/mail/messages/{row.pk}/").data["shared"])

    def test_internal_mail_has_no_customer_to_add_to(self):
        row = self.row(from_address="carl@acme.io")
        self.client.force_authenticate(self.dana)
        response = self.client.post(f"/api/v1/mail/messages/{row.pk}/share/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "CUSTOMER_NOT_FOUND")

    def test_someone_elses_message_is_404(self):
        row = self.row()
        self.client.force_authenticate(self.carl)
        self.assertEqual(
            self.client.post(f"/api/v1/mail/messages/{row.pk}/share/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
