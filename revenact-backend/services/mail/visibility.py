"""Who may read an email (owner decision 1, 2026-10-17: mail is owner-only).

Its mailbox owner, and nobody else, unless the owner added it to Revenact
(`shared_at`): then anyone who can open its customer or account. The
management chain no longer reads a report's mail. Emails logged by hand,
seeded or sent by a campaign (no owner, never synced) stay visible as they
always were; synced mail whose owner was deleted is nobody's, so nobody's.

Whatever others see that is *derived* from mail (headlines, feature-request
names, sentiment, anomalies, attributes, briefs) reads only
`shareable_emails_q()`: shared or ownerless mail, never someone's private
mail. Spec: docs/superpowers/specs/2026-10-17-private-mail-and-email-agent-design.md.
"""

from django.db.models import Q


def visible_emails_q(user):
    from services.customers.scoping import visible_children_q

    # SOC2:AUTH-02 personal mail: its owner, or shared on a record the reader can open
    return (
        _logged_q()
        | Q(mailbox_owner=user)
        | (Q(shared_at__isnull=False) & visible_children_q(user))
    )


def visible_emails(user, queryset):
    return queryset.filter(visible_emails_q(user))


def _logged_q(prefix=""):
    """Mail that never came through a mailbox: logged, seeded, campaigns."""
    return Q(**{f"{prefix}mailbox_owner__isnull": True, f"{prefix}synced_at__isnull": True})


def shareable_emails_q(prefix=""):
    """Mail whose content may shape what other people see: added to Revenact,
    or logged with no mailbox."""
    # SOC2:AUTH-02 private mail never feeds an output others read
    return _logged_q(prefix) | Q(**{f"{prefix}shared_at__isnull": False})


def own_mail_q(user, field="mailbox_owner"):
    """Copies of mail (evidence rows, agent threads) carry the owner only:
    readable by that owner, or by anyone when there is no owner."""
    return Q(**{f"{field}__isnull": True}) | Q(**{field: user})
