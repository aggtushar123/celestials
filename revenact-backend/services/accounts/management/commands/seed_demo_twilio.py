"""The guided agent's demo (spec §6): Twilio in the Alfred workspace looks
unhappy. Three open latency tickets (2, 5 and 9 days old), a call six days
ago whose CallSense summary flags renewal concerns, a health drop from 7.8 to
6.1 over two weeks (HealthSnapshots), and a champion whose last reply is 14
days old. The owner then sends the Slack message live.

Alfred only, anchored on its owner: the workspace is the one the active user
tushar@tryalfred.onworkspace.com belongs to, refused unless it is named
Alfred, and Twilio is the one Customer of that name in it (two or more are
refused, never guessed). Tushar is always made Twilio's owner (the demo's
bundle is his). Twilio must already be there (`seed_alfee`). Idempotent: every
row is matched and updated, never added twice. A dry run by default, printing
what it would write; `--apply` writes. The content is fictional; the champion
is an existing Twilio contact when there is one (its address is never
changed), else a made-up person on twilio.example. A one-line summary goes to
stdout and stderr (prod log capture of stdout is unreliable); after `--apply`
the command fails unless Twilio has its three open TW tickets and Tushar as
its owner.

    python manage.py seed_demo_twilio            # counts only
    python manage.py seed_demo_twilio --apply    # writes
"""

from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from services.accounts.models import User
from services.customers.models import Call, Contact, Customer, Email, HealthSnapshot, Ticket

from .seed_alfee import ORG_NAME, WORKSPACE_DOMAIN

RECORD = "Twilio"
OWNER_EMAIL = f"tushar@{WORKSPACE_DOMAIN}"
CHAMPION = {"name": "Dana Smith", "email": "dana.smith@twilio.example"}
TICKETS = (
    (
        "TW-4101",
        2,
        "critical",
        "SMS delivery latency over 40 seconds in EU",
        "Since the weekend, verification texts to EU numbers arrive 40 seconds late; "
        "sign-ups are timing out.",
    ),
    (
        "TW-4096",
        5,
        "high",
        "Webhook callbacks delayed during peak hours",
        "Status callbacks arrive minutes late between 9 and 11 UTC, so dashboards show "
        "messages stuck in sending.",
    ),
    (
        "TW-4088",
        9,
        "high",
        "API latency regression after the 3.2 rollout",
        "p95 latency on the Messages API doubled after the 3.2 rollout and has not recovered.",
    ),
)
CALL_TITLE = "Twilio - Quarterly delivery review"
CALL_SUMMARY = (
    "Dana said message latency has hurt their EU sign-up flow for two weeks and the team "
    "is losing confidence. She raised the renewal directly: leadership is asking whether "
    "to keep the contract when it renews next quarter unless latency is fixed and they "
    "hear a plan. Action: send a written recovery plan and set up a follow-up call."
)
REPLY_SUBJECT = "Re: Delivery report for September"
REPLY_BODY = (
    "Thanks for the report. The latency numbers still look worse than what we agreed. "
    "Can we get an update on the fix?"
)
#: (days ago, score): two weeks of the drop.
HEALTH = ((14, "7.8"), (10, "7.4"), (7, "7.0"), (3, "6.5"), (0, "6.1"))
CALL_DAYS = 6
REPLY_DAYS = 14


class Command(BaseCommand):
    help = "Seeds the guided agent's Twilio demo in the Alfred workspace (dry run by default)."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Write the rows.")
        parser.add_argument(
            "--org",
            default=ORG_NAME,
            help="The workspace's name. Only Alfred is accepted; anything else is refused.",
        )

    def handle(self, *args, **options):
        if options["org"] != ORG_NAME:
            raise CommandError(f"This demo is seeded only in {ORG_NAME}.")
        owner = (
            User.objects.filter(email__iexact=OWNER_EMAIL, is_active=True)
            .select_related("organisation")
            .first()
        )
        if owner is None or owner.organisation is None:
            raise CommandError(f"There is no active {OWNER_EMAIL} in a workspace.")
        organisation = owner.organisation
        if organisation.name != ORG_NAME:
            raise CommandError(
                f"{OWNER_EMAIL} is in {organisation.name!r} (id {organisation.pk}), "
                f"not {ORG_NAME}: refusing."
            )
        found = Customer.objects.filter(organisation=organisation, name=RECORD)
        count = found.count()
        if count == 0:
            raise CommandError(f"{ORG_NAME} has no {RECORD}: run seed_alfee first.")
        if count > 1:
            raise CommandError(
                f"{ORG_NAME} (id {organisation.pk}) has {count} customers named {RECORD}: "
                "refusing to guess which one."
            )
        twilio = found.get()
        apply = options["apply"]
        with transaction.atomic():
            counts = self._seed(owner, twilio)
            if not apply:
                transaction.set_rollback(True)
        verb = "wrote" if apply else "would write"
        for name, (made, kept) in counts.items():
            self.stdout.write(f"{verb} {name}: {made} new, {kept} updated")
        if not apply:
            self.stdout.write("Dry run: nothing was written. Pass --apply to write.")
        where = f"{ORG_NAME} (org {organisation.pk}), {RECORD} (customer {twilio.pk})"
        if apply:
            tickets, owner_id = self._check(twilio)
            if tickets != len(TICKETS) or owner_id != owner.pk:
                self._say(
                    f"seed_demo_twilio: FAILED on {where}: {tickets} open TW tickets, "
                    f"owner {owner_id} (expected {len(TICKETS)}, {owner.pk})"
                )
                raise CommandError(f"{RECORD} isn't seeded as expected on {where}.")
            self._say(
                f"seed_demo_twilio: applied on {where}: {tickets} open TW tickets, "
                f"owner {OWNER_EMAIL}"
            )
        else:
            self._say(f"seed_demo_twilio: dry run on {where}: nothing written")

    def _say(self, line):
        self.stdout.write(line)
        self.stderr.write(line)

    @staticmethod
    def _check(twilio):
        tickets = Ticket.objects.filter(
            customer=twilio,
            ticket_number__in=[number for number, *_ in TICKETS],
            status=Ticket.Status.OPEN,
        ).count()
        owner_id = Customer.objects.filter(pk=twilio.pk).values_list("owner_id", flat=True).first()
        return tickets, owner_id

    def _seed(self, owner, twilio):
        now = timezone.now()
        today = timezone.localdate(now)
        counts = {}
        counts["owner"] = self._owner(owner, twilio)
        counts["tickets"] = self._tickets(twilio, today)
        counts["call"] = self._call(twilio, now)
        counts["health snapshots"] = self._health(twilio, today)
        contact, counts["champion"] = self._champion(twilio, now)
        counts["last reply"] = self._reply(twilio, contact, now)
        return counts

    @staticmethod
    def _owner(owner, twilio):
        """Tushar always answers for Twilio (the owner asked: the demo's bundle is his)."""
        if twilio.owner_id == owner.pk:
            return (0, 0)
        Customer.objects.filter(pk=twilio.pk).update(owner=owner)
        return (0, 1)

    @staticmethod
    def _tickets(twilio, today):
        made = kept = 0
        for number, days, priority, title, description in TICKETS:
            _, created = Ticket.objects.update_or_create(
                customer=twilio,
                ticket_number=number,
                defaults={
                    "title": title,
                    "description": description,
                    "assignee_name": "Support",
                    "status": Ticket.Status.OPEN,
                    "priority": priority,
                    "opened_at": today - timedelta(days=days),
                    "resolved_at": None,
                    "department": "",
                    "requester_name": CHAMPION["name"],
                },
            )
            made, kept = made + created, kept + (not created)
        return (made, kept)

    @staticmethod
    def _call(twilio, now):
        _, created = Call.objects.update_or_create(
            customer=twilio,
            title=CALL_TITLE,
            defaults={
                "host_name": "Tushar",
                "occurred_at": now - timedelta(days=CALL_DAYS),
                "duration_minutes": 35,
                "summary": CALL_SUMMARY,
                "sentiment": "negative",
            },
        )
        return (int(created), int(not created))

    @staticmethod
    def _health(twilio, today):
        made = kept = 0
        for days, score in HEALTH:
            _, created = HealthSnapshot.objects.update_or_create(
                customer=twilio,
                captured_on=today - timedelta(days=days),
                defaults={
                    "health_score": Decimal(score),
                    "csm_pulse_score": twilio.csm_pulse_score,
                    "ai_pulse_value": twilio.ai_pulse_value,
                },
            )
            made, kept = made + created, kept + (not created)
        Customer.objects.filter(pk=twilio.pk).update(health_score=Decimal(HEALTH[-1][1]))
        return (made, kept)

    @staticmethod
    def _champion(twilio, now):
        """An existing Twilio contact (its address untouched), else a made-up one."""
        contacts = Contact.objects.filter(customer=twilio).order_by("pk")
        contact = contacts.filter(role=Contact.Role.CHAMPION).first() or contacts.first()
        last = now - timedelta(days=REPLY_DAYS)
        if contact is None:
            contact = Contact.objects.create(
                customer=twilio,
                name=CHAMPION["name"],
                email=CHAMPION["email"],
                role=Contact.Role.CHAMPION,
                sentiment=Contact.Sentiment.NEGATIVE,
                last_contacted_at=last,
            )
            return contact, (1, 0)
        Contact.objects.filter(pk=contact.pk).update(
            role=Contact.Role.CHAMPION,
            status=Contact.Status.ACTIVE,
            sentiment=Contact.Sentiment.NEGATIVE,
            last_contacted_at=last,
        )
        contact.refresh_from_db()
        return contact, (0, 1)

    @staticmethod
    def _reply(twilio, contact, now):
        """The champion's last reply, logged on Twilio (no mailbox: everyone who
        opens Twilio reads it)."""
        _, created = Email.objects.update_or_create(
            customer=twilio,
            subject=REPLY_SUBJECT,
            from_address=contact.email,
            defaults={
                "sender_name": contact.name,
                "recipient_name": "Tushar",
                "body": REPLY_BODY,
                "sent_at": now - timedelta(days=REPLY_DAYS),
                "direction": Email.Direction.RECEIVED,
                "sentiment": "negative",
            },
        )
        return (int(created), int(not created))
