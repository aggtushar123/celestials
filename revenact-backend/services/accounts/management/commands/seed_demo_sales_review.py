"""The sales review report's demo (spec §6): a meeting "Sales review"
tomorrow at 10:00 (workspace time) organised by Tushar, and a pipeline with
deals won and lost in the last 30 days, open deals across the stages and
some closing in the next 30. Then the daily check runs for the workspace, so
Tushar's proposal and its priority notice appear at once.

Alfred only: anchored on tushar@tryalfred.onworkspace.com's workspace and
refused unless it is named Alfred. The meeting is a local demo row
(`google_event_id` "revenact-demo-sales-review-<date>") on Tushar's connected
calendar; without a mailbox connection it is left out and said so. The deals
are fictional, on existing Alfred customers. Idempotent: deals are matched by
title, the meeting by its demo id. A dry run by default; `--apply` writes.

    python manage.py seed_demo_sales_review            # counts only
    python manage.py seed_demo_sales_review --apply    # writes
"""

from datetime import datetime, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from services.accounts.models import User
from services.customers.models import Customer, Opportunity

from .seed_alfee import ORG_NAME, WORKSPACE_DOMAIN

OWNER_EMAIL = f"tushar@{WORKSPACE_DOMAIN}"
MEETING_TITLE = "Sales review"
MEETING_AT = time(10, 0)
MEETING_MINUTES = 30
DEMO_ID = "revenact-demo-sales-review-{day}"
St = Opportunity.Stage
#: (title, stage, monthly amount, days from today to its close or expected
#: close, days ago its stage last changed). Closed deals close when their
#: stage changed.
DEALS = (
    ("Platform renewal, two years", St.CLOSED_WON, 4200, None, 3),
    ("Analytics add-on", St.CLOSED_WON, 1800, None, 9),
    ("Support tier upgrade", St.CLOSED_WON, 950, None, 16),
    ("Seat expansion, 40 seats", St.CLOSED_WON, 2600, None, 24),
    ("Data residency add-on", St.CLOSED_LOST, 1500, None, 6),
    ("Pilot to production", St.CLOSED_LOST, 3100, None, 19),
    ("Enterprise upgrade", St.NEGOTIATION, 5200, 5, 4),
    ("Multi-region rollout", St.PROPOSAL_PRICE_REVIEW, 3800, 12, 11),
    ("Onboarding services", St.SOLUTION_VALIDATION, 1200, 21, 40),
    ("Second business unit", St.QUALIFICATION, 2400, 28, 8),
    ("Global rollout, phase two", St.DISCOVERY, 7000, 60, 45),
    ("Security review package", St.QUALIFICATION, 900, 45, 13),
)


class Command(BaseCommand):
    help = "Seeds the sales review report's demo in the Alfred workspace (dry run by default)."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Write the rows.")

    def handle(self, *args, **options):
        owner = (
            User.objects.filter(email__iexact=OWNER_EMAIL).select_related("organisation").first()
        )
        if owner is None or owner.organisation is None:
            raise CommandError(f"There is no {OWNER_EMAIL}: run seed_alfee first.")
        organisation = owner.organisation
        # Never anyone else's workspace, whatever the anchor's account says.
        if organisation.name != ORG_NAME:
            raise CommandError(f"This demo is seeded only in {ORG_NAME}.")
        customers = list(Customer.objects.filter(organisation=organisation).order_by("name", "id"))
        if not customers:
            raise CommandError(f"{ORG_NAME} has no customers: run seed_alfee first.")
        apply = options["apply"]
        with transaction.atomic():
            lines = self._seed(organisation, owner, customers)
            if not apply:
                transaction.set_rollback(True)
        if apply:
            from services.agents.sales_review import check_meetings

            counts = check_meetings(organisation=organisation)
            lines.append(
                f"report bundles: {counts['made']} made, {counts['already']} already there"
            )
        verb = "wrote" if apply else "would write"
        for line in lines:
            said = f"{verb} {line}"
            self.stdout.write(said)
            self.stderr.write(said)
        if not apply:
            self.stdout.write("Dry run: nothing was written. Pass --apply to write.")

    def _seed(self, organisation, owner, customers):
        from services.work.clock import today_for, zone_for

        now = timezone.now()
        today = today_for(organisation, now)
        zone = zone_for(organisation)
        lines = [self._deals(customers, today, now)]
        lines.append(self._meeting(organisation, owner, today, zone))
        return lines

    @staticmethod
    def _deals(customers, today, now):
        made = kept = 0
        for n, (title, stage, amount, closes_in, changed_ago) in enumerate(DEALS):
            customer = customers[n % len(customers)]
            values = {
                "customer": customer,
                "stage": stage,
                "mrr": Decimal(amount),
                "department": User.Function.SALES,
                "expected_close": today + timedelta(days=closes_in)
                if closes_in is not None
                else today - timedelta(days=changed_ago),
            }
            row = Opportunity.objects.filter(
                customer__organisation=customer.organisation, title=title
            ).first()
            if row is None:
                row = Opportunity.objects.create(title=title, **values)
                made += 1
            else:
                for key, value in values.items():
                    setattr(row, key, value)
                row.save()
                kept += 1
            # The demo's own close dates: the stage clock is set, never the stage.
            Opportunity.objects.filter(pk=row.pk).update(
                stage_changed_at=now - timedelta(days=changed_ago)
            )
        return f"deals: {made} new, {kept} updated"

    @staticmethod
    def _meeting(organisation, owner, today, zone):
        from services.calendar.models import Meeting
        from services.mail.models import MailboxConnection

        connection = MailboxConnection.objects.filter(user=owner).first()
        if connection is None:
            return "meeting: none (Tushar has no connected mailbox to hold it)"
        day = today + timedelta(days=1)
        starts = datetime.combine(day, MEETING_AT, tzinfo=zone)
        _row, made = Meeting.objects.update_or_create(
            connection=connection,
            google_event_id=DEMO_ID.format(day=day.isoformat()),
            defaults={
                "organisation": organisation,
                "owner": owner,
                "title": MEETING_TITLE,
                "description": "A demo meeting made by seed_demo_sales_review.",
                "starts_at": starts,
                "ends_at": starts + timedelta(minutes=MEETING_MINUTES),
                "all_day": False,
                "organizer_email": owner.email,
                "attendees": [
                    {
                        "email": owner.email,
                        "name": owner.name,
                        "response": "accepted",
                        "organizer": True,
                        "self": True,
                    }
                ],
            },
        )
        return f"meeting: {'1 new' if made else '1 updated'} ({MEETING_TITLE}, {day} 10:00)"
