"""Who may connect Google, and when a Google mailbox is paused.

Connecting (contract §1) takes four gates, checked in order: the workspace
is switched on (the pilot approval), the person is an active member of an
active workspace, they hold a seat, and the address Google returns is on one
of the workspace's verified domains, exactly. Gates 1-3 and "has a verified
domain" run before OAuth and again in the callback.

A connected Google mailbox is paused, never deleted, when any of these stops
holding: precedence token_revoked, workspace_off, suspended, no_seat
(decision 23). The loop recomputes every pause in bulk once a minute
(`sweep`); the API computes the person's own live (`paused_reason`). A
paused mailbox is not synced and cannot send (decision 24). Outlook and IMAP
have no gates in this round.
"""

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from core import audit
from services.accounts.models import Organisation
from services.billing.models import SeatAssignment
from services.identity.models import OrganizationDomain, OrganizationMembership

from .models import MailboxConnection

GMAIL_NOT_ENABLED = "GMAIL_NOT_ENABLED"
MEMBER_SUSPENDED = "MEMBER_SUSPENDED"
NO_SEAT = "NO_SEAT"
NO_VERIFIED_DOMAIN = "NO_VERIFIED_DOMAIN"
WRONG_DOMAIN = "WRONG_DOMAIN"
SCOPES_MISSING = "SCOPES_MISSING"
ADDRESS_IN_USE = "ADDRESS_IN_USE"
GOOGLE_DENIED = "GOOGLE_DENIED"
#: Any OAuth provider: the callback reached a browser that didn't start it.
BROWSER_MISMATCH = "BROWSER_MISMATCH"

MESSAGES = {
    GMAIL_NOT_ENABLED: "Your workspace isn't enabled for Gmail yet: ask Revenact support.",
    MEMBER_SUSPENDED: "Your access to this workspace is suspended, so Gmail can't be connected.",
    NO_SEAT: "You need a seat in this workspace to connect Gmail. Ask an admin.",
    NO_VERIFIED_DOMAIN: (
        "Your workspace has no verified domain yet, so no Google account can connect. "
        "An admin can verify one in Settings."
    ),
    SCOPES_MISSING: (
        "Revenact needs all the Gmail permissions on the consent screen. "
        "Connect again and leave them all ticked."
    ),
    ADDRESS_IN_USE: "This Google account is already connected by someone else in Revenact.",
    GOOGLE_DENIED: (
        "Google didn't grant access. Either you cancelled, or this Google account isn't on "
        "Revenact's test-user list yet: ask Revenact support."
    ),
    BROWSER_MISMATCH: (
        "Finish connecting in the same browser you started from. "
        "If someone sent you a connect link, start from your own Integrations page instead."
    ),
}

Paused = MailboxConnection.PausedReason
PAUSED_MESSAGES = {
    Paused.WORKSPACE_OFF: (
        "Your Gmail connection is paused: your workspace isn't enabled for Gmail."
    ),
    Paused.SUSPENDED: (
        "Your Gmail connection is paused: your access to this workspace is suspended."
    ),
    Paused.NO_SEAT: "Your Gmail connection is paused: you don't hold a seat in this workspace.",
    Paused.TOKEN_REVOKED: (
        "Your Gmail connection is paused: Google access was revoked. Reconnect Google."
    ),
}
GOOGLE = MailboxConnection.Provider.GOOGLE
DISCONNECTED = MailboxConnection.Status.DISCONNECTED
ACTIVE = OrganizationMembership.Status.ACTIVE


def _membership_id(user_id, organisation_id):
    """The person's active membership in this workspace, or None. Read
    directly, not through identity.context (memoised per user instance), so
    the bulk sweep below and this agree row for row."""
    return (
        OrganizationMembership.objects.filter(
            user_id=user_id, organisation_id=organisation_id, status=ACTIVE
        )
        .values_list("pk", flat=True)
        .first()
    )


def _seated(membership_id):
    return SeatAssignment.objects.filter(
        membership_id=membership_id, released_at__isnull=True
    ).exists()


def verified_domains(organisation):
    return list(
        OrganizationDomain.objects.filter(
            organisation=organisation,
            verification_status=OrganizationDomain.VerificationStatus.VERIFIED,
        )
        .order_by("domain")
        .values_list("domain", flat=True)
    )


def early_gate(user):
    """Gates 1-3: the first failing code, or None."""
    # SOC2:AUTH-02 only an approved workspace's active, seated members connect Google
    organisation = getattr(user, "organisation", None)
    if organisation is None or not organisation.gmail_two_way_enabled:
        return GMAIL_NOT_ENABLED
    membership_id = _membership_id(user.pk, organisation.pk)
    if (
        not user.is_active
        or organisation.status != Organisation.Status.ACTIVE
        or membership_id is None
    ):
        return MEMBER_SUSPENDED
    if not _seated(membership_id):
        return NO_SEAT
    return None


def connect_gate(user):
    """Every pre-OAuth gate (1-3 and 4a): the first failing code, or None."""
    code = early_gate(user)
    if code is None and not verified_domains(user.organisation):
        return NO_VERIFIED_DOMAIN
    return code


def address_gate(organisation, address):
    """Gate 4b: (code, message) when `address` is not on a verified domain of
    the workspace, exactly (a subdomain is not its parent); else None."""
    domains = verified_domains(organisation)
    if not domains:
        return NO_VERIFIED_DOMAIN, MESSAGES[NO_VERIFIED_DOMAIN]
    domain = address.rsplit("@", 1)[-1].lower() if "@" in address else ""
    if domain in {d.lower() for d in domains}:
        return None
    return WRONG_DOMAIN, f"Connect your {' or '.join(domains[:3])} account."


def reason_for(*, stored, enabled, org_status, user_active, membership_id, seated):
    """The pause precedence (decision 23); "" when nothing holds it."""
    if stored == Paused.TOKEN_REVOKED:
        return Paused.TOKEN_REVOKED
    if not enabled:
        return Paused.WORKSPACE_OFF
    if not user_active or membership_id is None or org_status != Organisation.Status.ACTIVE:
        return Paused.SUSPENDED
    if not seated:
        return Paused.NO_SEAT
    return ""


def paused_reason(connection):
    """This Google mailbox's pause, computed live; "" for Outlook, IMAP and
    a disconnected row."""
    if connection.provider != GOOGLE or connection.status == DISCONNECTED:
        return ""
    organisation = Organisation.objects.only("gmail_two_way_enabled", "status").get(
        pk=connection.organisation_id
    )
    membership_id = _membership_id(connection.user_id, connection.organisation_id)
    return reason_for(
        stored=connection.paused_reason,
        enabled=organisation.gmail_two_way_enabled,
        org_status=organisation.status,
        user_active=connection.user.is_active,
        membership_id=membership_id,
        seated=membership_id is not None and _seated(membership_id),
    )


def sweep(*, now=None):
    """Recompute the pause of every live Google mailbox not revoked, in a few
    queries; write and audit each change, and wake a resumed one so it syncs
    straight away. token_revoked is cleared only by reconnecting. Returns
    (paused, resumed)."""
    now = now or timezone.now()
    rows = list(
        MailboxConnection.objects.filter(provider=GOOGLE)
        .exclude(status=DISCONNECTED)
        .exclude(paused_reason=Paused.TOKEN_REVOKED)
        .select_related("organisation", "user")
    )
    if not rows:
        return 0, 0
    members = {
        (user_id, organisation_id): pk
        for pk, user_id, organisation_id in OrganizationMembership.objects.filter(
            status=ACTIVE, user_id__in={row.user_id for row in rows}
        ).values_list("pk", "user_id", "organisation_id")
    }
    seated = set(
        SeatAssignment.objects.filter(
            released_at__isnull=True, membership_id__in=list(members.values())
        ).values_list("membership_id", flat=True)
    )
    paused = resumed = 0
    for row in rows:
        membership_id = members.get((row.user_id, row.organisation_id))
        reason = reason_for(
            stored=row.paused_reason,
            enabled=row.organisation.gmail_two_way_enabled,
            org_status=row.organisation.status,
            user_active=row.user.is_active,
            membership_id=membership_id,
            seated=membership_id in seated,
        )
        if reason == row.paused_reason:
            continue
        # Only over the pause this sweep read: a token_revoked written since
        # (by a tick or a send) is never erased, and nothing is audited.
        still = MailboxConnection.objects.filter(
            pk=row.pk, paused_reason=row.paused_reason
        ).exclude(status=DISCONNECTED)
        if reason:
            if not still.update(paused_reason=reason):
                continue
            paused += 1
            audit.record(  # SOC2:LOG-01 sync and sending stop for this mailbox
                "mailbox.paused",
                organisation=row.organisation,
                target=row,
                metadata={"reason": reason},
            )
        else:
            if not still.update(paused_reason="", wake_at=now):
                continue
            resumed += 1
            audit.record(  # SOC2:LOG-01
                "mailbox.resumed",
                organisation=row.organisation,
                target=row,
                metadata={"from": row.paused_reason},
            )
    return paused, resumed


def live_mailbox(user):
    """The person's connection, or None: no row, or a disconnected Google row
    kept only so its copies outlive the disconnect for 30 days."""
    connection = getattr(user, "mailbox", None)
    if connection is None or connection.status == DISCONNECTED:
        return None
    return connection


def paused_response(connection):
    """409 MAILBOX_PAUSED when this Google mailbox may not act for its owner;
    None otherwise. Checked before any provider call."""
    reason = paused_reason(connection)
    if not reason:
        return None
    return Response(
        {"code": "MAILBOX_PAUSED", "detail": PAUSED_MESSAGES[reason], "paused_reason": reason},
        status=status.HTTP_409_CONFLICT,
    )
