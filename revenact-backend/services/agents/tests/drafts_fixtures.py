"""Mail, tickets and reply drafts for the drafts tests, on AgentsFixture's
world (Carl owns Pizza Hut and reports to Mona). No real credentials: a
mailbox's are empty, and a test that sends patches the provider."""

from datetime import timedelta

from django.utils import timezone

from services.customers.models import Account, Email, ReplyDraft, Ticket
from services.mail.models import MailboxConnection
from services.metrics.models import AgentAction


def on(record):
    return {"account": record} if isinstance(record, Account) else {"customer": record}


def mailbox(user, *, status=MailboxConnection.Status.CONNECTED):
    """`user`'s own mailbox, IMAP, with empty credentials."""
    connection = MailboxConnection.objects.create(
        organisation=user.organisation,
        user=user,
        provider=MailboxConnection.Provider.IMAP,
        address=user.email,
        display_name=user.name,
        credentials="",
        status=status,
    )
    connection.set_credentials({})
    connection.save(update_fields=["credentials"])
    return connection


def inbound(
    record,
    owner,
    *,
    thread="t1",
    hours=2,
    subject="Renewal terms",
    body="Can we get the multi-year option?",
    sender=("Ann Lee", "ann@x.com"),
    message_id="<m1@x.com>",
):
    """A customer's email to `owner`, filed on `record`, `hours` ago."""
    return Email.objects.create(
        **on(record),
        subject=subject,
        sender_name=sender[0],
        recipient_name=owner.name,
        body=body,
        sent_at=timezone.now() - timedelta(hours=hours),
        mailbox=MailboxConnection.objects.filter(user=owner).first(),
        mailbox_owner=owner,
        direction=Email.Direction.RECEIVED,
        from_address=sender[1],
        thread_id=thread,
        provider_message_id=message_id,
    )


def share(email):
    """Its owner adds `email` to Revenact: mail is owner-only (2026-10-17)
    until then, and readable by whoever opens its record after."""
    Email.objects.filter(pk=email.pk).update(shared_at=timezone.now())
    email.refresh_from_db()
    return email


def outbound(original, *, hours=1):
    """`original`'s mailbox owner answering it, `hours` ago."""
    owner = original.mailbox_owner
    return Email.objects.create(
        customer=original.customer,
        account=original.account,
        subject=f"Re: {original.subject}",
        sender_name=owner.name,
        recipient_name=original.sender_name,
        body="On it.",
        sent_at=timezone.now() - timedelta(hours=hours),
        mailbox=original.mailbox,
        mailbox_owner=owner,
        direction=Email.Direction.SENT,
        from_address=owner.email,
        thread_id=original.thread_id,
        provider_message_id=f"<re-{original.pk}@acme.io>",
    )


def ticket(
    record,
    *,
    title="Export fails",
    department="",
    status=Ticket.Status.OPEN,
    number="TKT-1042",
    days=7,
    description="The export button fails on large files.",
):
    return Ticket.objects.create(
        **on(record),
        ticket_number=number,
        title=title,
        assignee_name="Support",
        status=status,
        priority=Ticket.Priority.HIGH,
        opened_at=timezone.localdate() - timedelta(days=days),
        department=department,
        description=description,
        requester_name="Ann Lee",
        requester_email="ann@x.com",
    )


def draft(
    source,
    owner,
    *,
    body="Hi Ann, yes: we can offer two years.",
    status=ReplyDraft.Status.OPEN,
    agent="cs",
    agent_action=None,
):
    """A reply draft answering `source` (an Email or a Ticket), owned by `owner`."""
    is_email = isinstance(source, Email)
    subject = f"Re: {source.subject}" if is_email else ""
    return ReplyDraft.objects.create(
        organisation=owner.organisation,
        owner=owner,
        channel=ReplyDraft.Channel.EMAIL if is_email else ReplyDraft.Channel.TICKET,
        status=status,
        customer=source.customer,
        account=source.account,
        email=source if is_email else None,
        ticket=None if is_email else source,
        to=[[source.sender_name, source.from_address]] if is_email else [],
        subject=subject,
        written_subject=subject,
        body=body,
        written_body=body,
        agent=agent,
        agent_action=agent_action,
    )


def draft_action(
    organisation,
    source,
    *,
    status="proposed",
    agent="cs",
    body="Hi Ann, yes: two years works.",
    result=None,
):
    """A draft.reply action answering `source` (an Email or a Ticket), with
    `before` read as the agent would have read it."""
    from services.agents.actions import drafts

    if isinstance(source, Email):
        payload = {
            "email_id": source.pk,
            "body": body,
            "to": f"{source.sender_name} <{source.from_address}>",
            "subject": f"Re: {source.subject}",
        }
    else:
        payload = {
            "ticket_id": source.pk,
            "body": body,
            "ticket": source.ticket_number,
            "subject": source.title,
        }
    action = AgentAction(
        organisation=organisation,
        agent=agent,
        batch="b",
        kind="draft.reply",
        customer=source.customer,
        account=source.account,
        target=drafts.target(payload),
        title="Reply to Ann Lee",
        rationale="She asked about the renewal.",
        evidence=["the email's own line"],
        payload=payload,
        status=status,
        result=result or {},
    )
    action.before = drafts.current(action)
    action.save()
    return action
