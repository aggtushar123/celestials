"""Run Copilot's golden set for one workspace and save the run
(services/copilot/evals.py). On production: execute the nightly job with
these args, e.g. `python manage.py run_copilot_evals --org Alfred`."""

from django.core.management.base import BaseCommand, CommandError

from services.accounts.models import Organisation
from services.copilot import evals


class Command(BaseCommand):
    help = (
        "Runs Copilot's golden set for a workspace, judged by a stronger model, and saves the run."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--org", help="The workspace's name; without it, settings.COPILOT_EVAL_ORGS."
        )
        parser.add_argument(
            "--case", action="append", default=[], help="Only this case id (repeatable)."
        )

    def handle(self, *args, org, case, **options):
        from django.conf import settings

        names = [org] if org else list(settings.COPILOT_EVAL_ORGS)
        if not names:
            self.stdout.write("No workspace to evaluate (set COPILOT_EVAL_ORGS or pass --org).")
            return
        for name in names:
            organisation = Organisation.objects.filter(name=name).first()
            if organisation is None:
                raise CommandError(f"No workspace named {name!r}.")
            made = evals.run(organisation, only=set(case) or None, out=self.stdout.write)
            self.stdout.write(f"Run {made.pk} ({name}): {made.passed} of {made.total} passed.")
