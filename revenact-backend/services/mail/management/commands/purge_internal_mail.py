"""Delete stored internal mail (owner decision D, 2026-10-17).

Sync no longer keeps a message whose sender and every recipient are members
of the workspace. This removes the copies kept before that change, with
their attachments' metadata (cascade). Dry run by default: it counts.

    python manage.py purge_internal_mail            # count only
    python manage.py purge_internal_mail --delete   # delete
"""

from django.core.management.base import BaseCommand

from core import audit
from services.mail import internal
from services.mail.models import MailMessage


class Command(BaseCommand):
    help = "Count, or with --delete remove, stored internal mail (colleagues only)."

    def add_arguments(self, parser):
        parser.add_argument("--delete", action="store_true")

    def handle(self, *args, delete=False, **options):
        doomed = []
        rows = MailMessage.objects.select_related("connection").only(
            "id",
            "organisation_id",
            "from_address",
            "to",
            "cc",
            "bcc",
            "connection__organisation_id",
        )
        for row in rows.iterator():
            pairs = [["", row.from_address], *row.to, *row.cc, *row.bcc]
            found = {address.lower() for _, address in pairs if address}
            if len(found) >= 2 and found <= internal.members(row.organisation_id):
                doomed.append(row.pk)
        if not delete:
            self.stdout.write(f"{len(doomed)} internal message(s) would be deleted (dry run)")
            return
        deleted = 0
        for start in range(0, len(doomed), 500):
            deleted += (
                MailMessage.objects.filter(pk__in=doomed[start : start + 500])
                .delete()[1]
                .get("mail.MailMessage", 0)
            )
        audit.record(  # SOC2:LOG-01 counts only
            "mail.internal_purged", actor=None, metadata={"messages": deleted}
        )
        self.stdout.write(self.style.SUCCESS(f"{deleted} internal message(s) deleted"))
