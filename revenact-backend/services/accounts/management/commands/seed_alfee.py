"""The Alfred workspace: the whole demo book with the team's own people.

The same seeders as seed_demo, in the same order, under the Alfred cast
(services.accounts.demo_cast): Tushar is the admin and leads (Alice's
place), Faiz and Jesh are CSMs who both report to him (Carl's and Dana's),
and Priya, Raj and Mei answer for Engineering, Sales and Analytics. Every
person's password is ALFEE_DEMO_PASSWORD; the command refuses to run
without one of at least 12 characters, so no default password reaches a
deployment. Idempotent, like seed_demo.

Tushar, Faiz and Jesh have real mailboxes on the team's Google Workspace
(WORKSPACE_DOMAIN), so Gmail, Calendar and Sign in with Google work end to
end; Priya, Raj and Mei stay demo people. The domain is seeded pending:
onworkspace.com takes no DNS record, so Revenact staff verify it from the
platform portal. The workspace was called Alfee until 2026-10-17; a database
that still holds Alfee is renamed in place (`_move_from_alfee`), keeping
every Slack and Jira link, mailbox and record. The command, its job and the
ALFEE_DEMO_PASSWORD secret keep the old name.

    ALFEE_DEMO_PASSWORD=... python manage.py seed_alfee
"""

import os

from django.core.management.base import CommandError
from django.db import transaction

from services.accounts import demo_cast
from services.accounts.models import Organisation, User
from services.identity import domains
from services.identity.models import OrganizationDomain

from .seed_demo import Command as SeedDemo

ORG_NAME = "Alfred"
FORMER_NAME = "Alfee"
WORKSPACE_DOMAIN = "tryalfred.onworkspace.com"
MIN_PASSWORD = 12

PEOPLE = {
    "alice@acme.io": {"email": f"tushar@{WORKSPACE_DOMAIN}", "name": "Tushar"},
    "carl@acme.io": {"email": f"faiz@{WORKSPACE_DOMAIN}", "name": "Faiz"},
    "dana@acme.io": {"email": f"jesh@{WORKSPACE_DOMAIN}", "name": "Jesh"},
    "priya@acme.io": {"email": "priya@alfee.io", "name": "Priya Nair"},
    "raj@acme.io": {"email": "raj@alfee.io", "name": "Raj Mehta"},
    "mei@acme.io": {"email": "mei@alfee.io", "name": "Mei Tanaka"},
}

#: Jesh reports to Tushar, not to Faiz (Dana reports to Carl in Acme).
REPORTS_TO = {"dana@acme.io": "alice@acme.io"}


class Command(SeedDemo):
    help = "Seeds the Alfred workspace: the demo book with the team's people (idempotent)."
    org_name = ORG_NAME

    def handle(self, *args, **options):
        password = os.environ.get("ALFEE_DEMO_PASSWORD", "")
        if len(password) < MIN_PASSWORD:
            raise CommandError(
                f"Set ALFEE_DEMO_PASSWORD (at least {MIN_PASSWORD} characters) first."
            )
        self._move_from_alfee()
        cast = {"password": password, "people": PEOPLE, "reports_to": REPORTS_TO}
        with demo_cast.using(cast):
            super().handle(*args, **options)
        self._claim_domain()

    @transaction.atomic
    def _move_from_alfee(self):
        """Rename the Alfee workspace and its Workspace people in place, once."""
        org = Organisation.objects.filter(name=FORMER_NAME).first()
        if org is None or Organisation.objects.filter(name=ORG_NAME).exists():
            return
        org.name = ORG_NAME
        org.save(update_fields=["name"])
        self.stdout.write(f"renamed {FORMER_NAME} to {ORG_NAME}")
        for person in PEOPLE.values():
            new = person["email"]
            old = f"{new.split('@')[0]}@alfee.io"
            if new == old or User.objects.filter(email=new).exists():
                continue
            if User.objects.filter(email=old, organisation=org).update(email=new):
                self.stdout.write(f"{old} is now {new}")

    def _claim_domain(self):
        """The Workspace domain, pending until staff verify it."""
        org = Organisation.objects.get(name=ORG_NAME)
        _, created = OrganizationDomain.objects.get_or_create(
            organisation=org,
            domain=WORKSPACE_DOMAIN,
            defaults={"verification_token": domains.new_token(), "is_primary": True},
        )
        if created:
            self.stdout.write(f"claimed {WORKSPACE_DOMAIN} (pending staff verification)")
