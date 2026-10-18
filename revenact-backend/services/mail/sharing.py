"""Add to Revenact (owner decision 2, 2026-10-17).

Mail is its owner's alone. Adding a conversation to Revenact shares every
filed message of that thread in the owner's mailbox with whoever can open
its customer or account; removing it takes them all back. A mailbox message
not filed yet (nobody matched it at sync, or it predates the customer) is
filed on the customer its people belong to, then shared. Audited with the
count only, never a subject or an address.
"""

from django.utils import timezone

from core import audit
from services.customers.models import Email

from .models import MailMessage
from .sync import match_parent


class ShareRefused(Exception):
    def __init__(self, code, message, http_status=400):
        super().__init__(message)
        self.code, self.message, self.http_status = code, message, http_status


def _thread_rows(email):
    rows = Email.objects.filter(mailbox_owner_id=email.mailbox_owner_id)
    return rows.filter(thread_id=email.thread_id) if email.thread_id else rows.filter(pk=email.pk)


def set_shared(user, email, shared, *, request=None):
    """Share or unshare `email`'s thread. Returns how many messages it holds."""
    # SOC2:AUTH-02 only the mailbox's owner decides who else reads it
    if email.mailbox_owner_id is None or email.mailbox_owner_id != user.pk:
        raise ShareRefused("NOT_YOURS", "Only the person whose mailbox this is can share it.", 403)
    rows = _thread_rows(email)
    count = rows.count()
    if shared:
        rows.filter(shared_at__isnull=True).update(shared_at=timezone.now(), shared_by=user)
    else:
        rows.update(shared_at=None, shared_by=None)
    audit.record(  # SOC2:LOG-01 counts only
        "email.shared" if shared else "email.unshared",
        request=request,
        actor=user,
        organisation=user.organisation,
        target=email,
        metadata={"count": count},
    )
    return count


def _counterparts(row, own_address):
    own = (own_address or "").lower()
    pairs = [*row.to, *row.cc]
    if row.direction == MailMessage.Direction.RECEIVED:
        pairs = [[row.from_name, row.from_address], *pairs]
    return [address.lower() for _, address in pairs if address and address.lower() != own]


def share_message(user, row, *, request=None):
    """File (if needed) and share a message of the owner's mailbox. Returns the Email."""
    if row.email_id is None:
        customer, account = match_parent(
            row.organisation, _counterparts(row, row.connection.address)
        )
        if customer is None and account is None:
            raise ShareRefused(
                "CUSTOMER_NOT_FOUND", "Nobody on this conversation belongs to a customer.", 400
            )
        recipients = [*row.to, *row.cc]
        email = Email.objects.create(
            customer=customer,
            account=account,
            subject=row.subject[:255],
            sender_name=(row.from_name or row.from_address)[:150],
            recipient_name=(recipients[0][0] or recipients[0][1] if recipients else "")[:150],
            body=row.body,
            sent_at=row.sent_at,
            mailbox=row.connection,
            mailbox_owner=user,
            direction=row.direction,
            from_address=row.from_address[:254],
            to_addresses=[address for _, address in recipients][:50],
            thread_id=row.thread_id[:255],
            provider_message_id=row.provider_message_id[:255],
            synced_at=timezone.now(),
        )
        MailMessage.objects.filter(pk=row.pk).update(email=email)
    else:
        email = row.email
    set_shared(user, email, True, request=request)
    return email
