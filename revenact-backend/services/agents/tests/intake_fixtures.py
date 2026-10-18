"""Intake's tests' world (agent bundles D2): BundleFixture's people and book
(Carl owns Pizza Hut and reports to Mona; Dana owns Taco Bell; Mona owns Soup
Co; Loose Ltd has no owner; Alice is an admin with view-all and Leadership;
Lee is Leadership without view-all; Sam is in Sales), plus Erin in
Engineering, ticket connectors, threads touched as the sync touches them,
and message bundles. Nothing reaches a provider or a model."""

import json
from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone

from services.accounts.models import User
from services.agents import evidence, routing, threads
from services.agents.models import AgentBundle
from services.agents.tests.bundle_fixtures import BundleFixture
from services.agents.tests.drafts_fixtures import inbound, mailbox
from services.agents.tests.drafts_fixtures import ticket as make_ticket
from services.connectors.models import Connector
from services.customers.models import Customer, Email, Ticket
from services.mail.models import MailboxConnection
from services.segments.tests.fixtures import person

#: Where a fake model answer is patched (one place): the intake run's call.
MODEL = "services.agents.intake.get_completion"

#: Old enough to be past the 15-minute quiet rule (D2-22).
QUIET_AGO = timedelta(minutes=30)


def _routed_user(thread, record):
    """Whom an owner-routed bundle goes to (routing.route): a mail thread's
    mailbox owner (mail is owner-only, 2026-10-17), else the record's owner."""
    if thread.source_kind == thread.SourceKind.MAIL:
        return thread.mailbox_owner
    return record.owner


class IntakeFixture(BundleFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.erin = person("erin@acme.io", "Erin Eng", cls.org, function=User.Function.ENGINEERING)
        Customer.objects.filter(pk=cls.pizza.pk).update(domain="pizzahut.com")
        cls.pizza.refresh_from_db()

    _connectors = 0

    def connector(self, provider="zendesk", department="cs", name=None):
        """An enabled ticket connector with a (fake) secret; each gets a unique
        name (a connector is unique on organisation, provider and name)."""
        IntakeFixture._connectors += 1
        made = Connector.objects.create(
            organisation=self.org,
            provider=provider,
            department=department,
            name=name or f"{provider} {department or 'everyone'} {IntakeFixture._connectors}",
        )
        made.set_credentials({"token": "test-only"})
        made.save(update_fields=["credentials"])
        return made

    def ticket_thread(
        self,
        record,
        *,
        connector=None,
        ago=QUIET_AGO,
        title="Login loop after password reset",
        description="Since Monday nobody can log in after resetting a password.",
        status=Ticket.Status.OPEN,
        number="ZD-1042",
    ):
        """A ticket filed through `connector` on `record`, its thread touched `ago`."""
        connector = connector or self.connector()
        made = make_ticket(
            record,
            title=title,
            department=connector.department,
            status=status,
            number=number,
            days=0,
            description=description,
        )
        Ticket.objects.filter(pk=made.pk).update(connector=connector, external_id=number)
        made.refresh_from_db()
        thread = threads.touch_ticket(made, now=timezone.now() - ago, first_seen=True)
        return made, thread

    def mail_thread(
        self,
        record,
        owner,
        *,
        ago=QUIET_AGO,
        thread="t1",
        subject="Login loop",
        body="The login loop is back since the password reset.",
    ):
        """A customer's email to `owner`'s connected mailbox, filed on
        `record` `ago`, its thread touched."""
        if not MailboxConnection.objects.filter(user=owner).exists():
            mailbox(owner)
        count = Email.objects.filter(thread_id=thread).count()
        email = inbound(
            record,
            owner,
            thread=thread,
            hours=0,
            subject=subject,
            body=body,
            message_id=f"<{thread}-{count}@x.com>",
        )
        Email.objects.filter(pk=email.pk).update(sent_at=timezone.now() - ago)
        email.refresh_from_db()
        return email, threads.touch_mail(email)

    def message_bundle(
        self,
        thread,
        *steps,
        routed_to="owner",
        department="",
        agent="cs",
        title="Pizza Hut: login loop",
    ):
        """A waiting bundle answering `thread`, routed as given, holding `steps`."""
        record = thread.record
        bundle = self.bundle_of(record, *steps, agent=agent, title=title)
        AgentBundle.objects.filter(pk=bundle.pk).update(
            source=AgentBundle.Source.THREAD,
            thread=thread,
            routed_to=routed_to,
            routed_user=_routed_user(thread, record) if routed_to == "owner" else None,
            department=department,
        )
        bundle.refresh_from_db()
        return bundle

    def thread_ctx(self, thread, agent="cs"):
        """The context the run builds for `thread` (contract D2-13), and its route."""
        found, _reason = routing.route(thread)
        ctx = evidence.build_for_thread(self.org, agent, thread, found, today=self.today)
        return ctx, found

    @staticmethod
    def thread_line(ctx, prefix):
        """The first citeable line of the thread's record starting with `prefix`."""
        return next(
            line
            for line in sorted(evidence.record_lines(ctx, ctx.thread_ref))
            if line.startswith(prefix)
        )

    @staticmethod
    def answer(*items, title="Pizza Hut: login loop", reason="They are locked out."):
        """A thread answer as the model writes it (contract D2-14)."""
        return json.dumps({"title": title, "reason": reason, "actions": list(items)})

    def run_intake(self, raw=None, *, now=None, side_effect=None):
        """One intake run over this workspace with a fake model (never a real one)."""
        from services.agents import intake

        completion = patch(
            MODEL,
            return_value=raw if raw is not None else self.answer(),
            side_effect=side_effect,
        )
        with patch("services.agents.policy.plan_credits", return_value=3000), completion as model:
            result = intake.run_all(now=now, organisation=self.org)
        return result, model
