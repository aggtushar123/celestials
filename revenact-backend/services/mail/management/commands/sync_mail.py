"""Sync connected mailboxes. `--loop` runs the mail loop until SIGTERM (the
`mailsync` service in revenact-infra): Gmail every minute or on a push,
Outlook and IMAP every ten. Without it, one pass over every live mailbox;
`--user <email>` for one person."""

from django.core.management.base import BaseCommand, CommandError

from services.mail.loop import Loop, run_all
from services.mail.models import MailboxConnection


class Command(BaseCommand):
    help = "Sync connected mailboxes into the customer records (--loop: until stopped)."

    def add_arguments(self, parser):
        parser.add_argument("--user", help="Only this person's mailbox (their login email).")
        parser.add_argument("--loop", action="store_true", help="Run the mail loop until SIGTERM.")

    def handle(self, *args, **options):
        if options["loop"]:
            if options["user"]:
                raise CommandError("--loop syncs every mailbox; drop --user.")
            self.stdout.write("mail loop: started")
            Loop().forever()
            self.stdout.write("mail loop: stopped")
            return
        synced, filed = run_all(user_email=options["user"])
        errors = MailboxConnection.objects.filter(status=MailboxConnection.Status.ERROR)
        if options["user"]:
            errors = errors.filter(user__email=options["user"])
        for connection in errors:
            # The mailbox's own address and a fixed reason; never mail content.
            self.stderr.write(f"  {connection.address}: {connection.error}")
        self.stdout.write(
            self.style.SUCCESS(
                f"synced {synced} mailbox(es): filed {filed} email(s), "
                f"{errors.count()} need attention"
            )
        )
