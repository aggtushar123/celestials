"""Message intake (agent bundles D2, round 2 D3): the agents read what was
filed and propose bundles. Every 5 minutes from the `agentsignals` sleep loop
(docker-compose.yml), two lanes: the interval run (each workspace when its
interval is due) and the fast lane (urgent threads after 2 quiet minutes,
within its caps, R2D3-16). This project has no task queue by design. Safe to
overlap with itself: each workspace, tick and thread is claimed.

    python manage.py run_agent_signals
    python manage.py run_agent_signals --organisation 12
    python manage.py run_agent_signals --lane fast
"""

from django.core.management.base import BaseCommand, CommandError

from services.accounts.models import Organisation
from services.agents import intake


class Command(BaseCommand):
    help = "Let the agents read the messages filed since each workspace's last run."

    def add_arguments(self, parser):
        parser.add_argument("--organisation", type=int, help="Only this workspace id.")
        parser.add_argument(
            "--lane",
            choices=("interval", "fast", "both"),
            default="both",
            help="The interval run, the fast lane, or both (the default).",
        )

    def handle(self, *args, **options):
        organisation = None
        if options["organisation"]:
            organisation = Organisation.objects.filter(pk=options["organisation"]).first()
            if organisation is None:
                raise CommandError(f"No workspace {options['organisation']}.")
        lane = options["lane"]
        crashed = []
        if lane in ("interval", "both"):
            try:
                self._interval(organisation)
            except Exception as exc:  # noqa: BLE001 - one lane's crash never stops the other
                self.stderr.write(f"interval run failed: {type(exc).__name__}")
                crashed.append("interval")
        if lane in ("fast", "both"):
            try:
                self._fast(organisation)
            except Exception as exc:  # noqa: BLE001 - one lane's crash never stops the other
                self.stderr.write(f"fast lane failed: {type(exc).__name__}")
                crashed.append("fast")
        if crashed:
            # A crash still exits non-zero, as before the lanes were split.
            raise CommandError(f"Failed: {', '.join(crashed)}.")

    def _interval(self, organisation):
        result = intake.run_all(organisation=organisation)
        self.stdout.write(
            self.style.SUCCESS(
                f"read {result.threads} thread(s): {result.made} new bundle(s), "
                f"{result.refreshed} updated, {result.superseded} replaced, "
                f"{result.flagged} flagged, {result.skipped} skipped, "
                f"{result.waiting} waiting on credits, {result.failed} failed (interval)"
            )
        )
        for failure in result.errors:
            self.stdout.write(self.style.WARNING(f"intake failed: {failure}"))

    def _fast(self, organisation):
        fast = intake.run_fast(organisation=organisation)
        self.stdout.write(
            self.style.SUCCESS(
                f"fast lane: read {fast.threads} thread(s) in {fast.workspaces} "
                f"workspace(s), {fast.capped} capped"
            )
        )
        for failure in fast.errors:
            self.stdout.write(self.style.WARNING(f"fast lane failed: {failure}"))
