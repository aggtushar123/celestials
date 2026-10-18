"""Outbound email. A thin wrapper around django.core.mail.send_mail — the
actual delivery mechanism (real SMTP vs. the console backend that just
prints to the runserver terminal) is controlled entirely by EMAIL_BACKEND
in config/settings.py; nothing here knows or cares which one is active.

Pulled out of accounts/serializers.py into its own module so "how do we
build and send this email" has one home per email, not re-implemented
inline on whichever serializer happens to trigger it first — the next
transactional email (e.g. a CSM invite) adds a function here, not a new
ad-hoc send_mail() call somewhere else.
"""

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode


def send_password_reset_email(user):
    """Emails `user` a link to {FRONTEND_URL}/reset-password?uid=...&token=....
    Used by accounts.serializers.ForgotPasswordSerializer — see there for
    why the uid/token pair is safe to email out (Django's built-in
    PasswordResetTokenGenerator, no separate token model)."""

    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    reset_link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"

    send_mail(
        subject="Reset your Revenact password",
        message=(
            f"Hi {user.name},\n\n"
            "Someone requested a password reset for your Revenact account. "
            "If this was you, click the link below to choose a new one "
            "(it expires in 1 hour):\n\n"
            f"{reset_link}\n\n"
            "If you didn't request this, you can safely ignore this email — "
            "your password hasn't been changed."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
    )


def send_scenario_email(customer, subject, body):
    """Sends a Scenario's "Send Email" action node for real — same
    send_mail plumbing as send_password_reset_email above, to
    `customer.email` instead of a User's. Called from
    scenarios.engine.run_scenario; raises ValueError (caught there and
    logged as a failed node, not a crashed run) if the Customer has no
    email on record rather than silently mailing nobody."""

    if not customer.email:
        raise ValueError(f"{customer.name} has no email on record.")

    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[customer.email],
    )


def send_campaign_email(address, subject, body, *, connection=None):
    """One campaign email to one address, plain text: the subject and body
    are the owner's words with the merge fields filled and the footer added
    (services.campaigns.rendering), never rendered as HTML. `connection` is
    the send's one mail connection (None opens one). Raises on failure;
    services.campaigns.sending marks that delivery skipped `failed`."""

    if not address:
        raise ValueError("no address")
    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[address],
        connection=connection,
    )


def send_survey_email(invite, token, *, connection=None):
    """Emails one person their one-time survey link,
    {FRONTEND_URL}/s/<token>. Plain text: the intro is the builder's own
    words and is never rendered as HTML. The token exists only here and in
    the link; the invite stores its hash. `connection` is the batch's one
    mail connection (None opens one for this message). Raises on failure;
    surveys.sending marks that invite failed and carries on with the batch."""

    from services.surveys.models import LINK_DAYS
    from services.surveys.questions import question_for

    send = invite.send
    intro = [send.intro, ""] if send.intro else []
    send_mail(
        subject=send.subject,
        message="\n".join(
            [
                *intro,
                question_for(send.survey_type, send.organisation.name),
                "",
                "Answer here, it takes a few seconds:",
                f"{settings.FRONTEND_URL}/s/{token}",
                "",
                f"The link works for {LINK_DAYS} days and takes one answer.",
            ]
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[invite.email],
        connection=connection,
    )


def send_invitation_email(invitation):
    """Tells `invitation.email` an administrator has asked them into an
    organisation, and where to sign in. There is no token in the link:
    acceptance is keyed on the address a provider verifies at sign-in, so
    forwarding this email hands nothing to anyone else. Called from
    identity.onboarding.invite."""

    inviter = invitation.invited_by.name if invitation.invited_by else "An administrator"
    organisation = invitation.organisation.name
    send_mail(
        subject=f"You have been invited to {organisation} on Revenact",
        message=(
            f"Hi,\n\n"
            f"{inviter} has invited you to join {organisation} on Revenact "
            f"as {invitation.role.name}.\n\n"
            f"Sign in with this address ({invitation.email}) using Google or Microsoft "
            f"and you will be taken straight in:\n\n"
            f"{settings.FRONTEND_URL}/login\n\n"
            f"The invitation expires on {invitation.expires_at:%d %B %Y}. "
            "If you were not expecting it, you can ignore this email."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[invitation.email],
    )


def send_work_digest(user, subject, body):
    """Work's daily digest to one person, plain text (services.work.digest).
    Raises on failure; the digest marks that person's day failed."""

    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
    )
