"""Dev/demo convenience — not part of the product. Seeds Campaign rows
against real seeded Contacts so /campaigns has real data immediately —
run after seed_demo_contacts.

One draft on a contact segment of Apple Inc's contacts, and one active
campaign with one manual send built from rows — "seed the state, not the
side effect": nothing is emailed.

Idempotent: matched by (organisation, name), same spirit as
seed_demo_risks's (parent, title) — re-running updates existing rows
instead of duplicating them.

Usage:
    python manage.py seed_demo_campaigns --org-email alice@acme.io
"""

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from services.accounts.models import User
from services.campaigns.models import Campaign, CampaignDelivery, CampaignSend, empty_counts
from services.customers.models import Contact, Customer
from services.segments.models import Segment


class Command(BaseCommand):
    help = "Seeds demo Campaign rows against real seeded Customers/Contacts."

    def add_arguments(self, parser):
        parser.add_argument(
            "--org-email",
            required=True,
            help="Email of a user in the target organisation (e.g. the admin who signed up).",
        )

    def handle(self, *args, **options):
        try:
            caller = User.objects.get(email=options["org_email"])
        except User.DoesNotExist as exc:
            raise CommandError(f"No user with email {options['org_email']!r}.") from exc

        org = caller.organisation
        created, updated, skipped = 0, 0, 0

        try:
            apple = Customer.objects.get(organisation=org, name="Apple Inc")
        except Customer.DoesNotExist:
            self.stderr.write(f"  skipping campaigns — no customer 'Apple Inc' in {org.name}.")
            self.stdout.write(
                self.style.SUCCESS(f"{org.name}: created 0, updated 0, skipped 2 campaign(s).")
            )
            return

        contacts = list(Contact.objects.filter(customer=apple).order_by("name"))
        if not contacts:
            self.stderr.write("  skipping campaigns — Apple Inc has no real seeded contacts yet.")
            self.stdout.write(
                self.style.SUCCESS(f"{org.name}: created 0, updated 0, skipped 2 campaign(s).")
            )
            return

        segment, _ = Segment.objects.update_or_create(
            organisation=org,
            owner=caller,
            name="Apple Inc contacts",
            defaults={"kind": "contact", "pinned_ids": [c.pk for c in contacts]},
        )
        common = {"owner": caller, "segment": segment, "roles": []}
        draft, was_created = Campaign.objects.update_or_create(
            organisation=org,
            name="Q4 Renewal Outreach",
            defaults={
                **common,
                "subject": "Your Q4 renewal, {first_name}",
                "body": (
                    "Hi {first_name},\n\nAs we head into Q4, I wanted to check in ahead of "
                    "{organisation}'s renewal and see how things are going.\n\n{sender_name}"
                ),
                "status": Campaign.Status.DRAFT,
            },
        )
        created += was_created
        updated += not was_created

        sent, was_created = Campaign.objects.update_or_create(
            organisation=org,
            name="Product Update — September",
            defaults={
                **common,
                "subject": "What's new this month",
                "body": (
                    "Hi {first_name},\n\nA quick rundown of what shipped this month."
                    "\n\n{sender_name}"
                ),
                "status": Campaign.Status.ACTIVE,
            },
        )
        created += was_created
        updated += not was_created
        if not sent.sends.exists():
            at = timezone.now() - timezone.timedelta(days=5)
            send = CampaignSend.objects.create(
                campaign=sent,
                kind=CampaignSend.Kind.MANUAL,
                status=CampaignSend.Status.SENT,
                sent_by=caller,
                started_at=at,
                finished_at=at,
                subject=sent.subject,
                body=sent.body,
                counts={**empty_counts(), "reached": len(contacts), "sent": len(contacts)},
            )
            CampaignDelivery.objects.bulk_create(
                [
                    CampaignDelivery(
                        send=send, contact=c, status=CampaignDelivery.Status.SENT, sent_at=at
                    )
                    for c in contacts
                ]
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"{org.name}: created {created}, updated {updated}, skipped {skipped} campaign(s)."
            )
        )
