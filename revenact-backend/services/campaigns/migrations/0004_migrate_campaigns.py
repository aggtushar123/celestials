"""Move every campaign from before segments onto the new shape (campaigns
spec §1.2), workspace by workspace:

- the owner is the workspace's owner (`OrganizationMembership.is_owner`, an
  active membership on an active user), else its first active admin, else
  its first active member, else its first member, computed once per
  organisation (every campaign in a workspace shares the same answer); a
  workspace with no user at all loses its campaigns (nobody could read
  them) — deleted, not archived, and irreversible: `backwards` cannot bring
  back a row that is gone. Logged as a count only, never by name;
- sharing is `private`; the name is cut to 120 and the subject to 150,
  before 0005 shrinks those columns;
- a campaign that was sent, or is stuck at `sending`, becomes `active` with
  one `CampaignSend` (`manual`, `migrated`, nobody's, `sent`, at its
  `sent_at`), and each `send_log` entry becomes a delivery, `sent` (linked
  to the Email row it filed, matched by contact) or `skipped`/`failed`.
  Contacts are looked up inside the campaign's own organisation only, so a
  foreign id in the log (another workspace's contact) can never become a
  cross-tenant delivery; the old free-text `detail` is dropped: it could
  hold an address or an exception's text. Entries for contacts deleted
  since, or outside the workspace, are dropped too. Anyone the old view
  actually emailed — a real `Email` row filed under this campaign — but
  `send_log` never recorded, because the send was cut off before it
  reached its own finish step, is recovered as a `sent` delivery from that
  `Email` row instead of being lost;
- a campaign that already carries a migrated send (built by an earlier run
  of this same migration) is left alone: its fields are reapplied but no
  second send is built. That is what makes a rollback-then-redeploy safe —
  0005's reverse puts `send_log`/`sent_at` back and `backwards` below only
  flips the status, so without this check a redeploy would double every
  migrated send's history;
- a draft stays a draft with no segment; its hand-picked recipients stay as
  read-only history.

Campaigns are read with `.iterator()`, so even a large table is never held
in memory at once, and written with `.update()`, so `updated_at` (the
list's order) does not move. The logic is importable so it can be tested;
it is frozen here, not imported from the app, so this migration always
does the same thing. Reverse: statuses go back to `sent`/`draft`; sends,
deliveries and owners stay (a no-op for sends, and for a workspace whose
campaigns were already deleted forwards)."""

from collections import Counter
from types import SimpleNamespace

from django.db import migrations
from django.db.models import Q

NAME, SUBJECT = 120, 150
LEGACY = ("sending", "sent")
REASONS = (
    "unsubscribed",
    "no_email",
    "already_received",
    "recent_campaign",
    "over_limit",
    "failed",
)


def trim(text, limit):
    return (text or "")[:limit]


def entries(send_log, known):
    """[(contact_id, "sent" | "skipped")], one per contact still in `known`,
    in log order. Everything else in an entry is dropped."""
    seen, rows = set(), []
    for entry in send_log or []:
        if not isinstance(entry, dict):
            continue
        contact_id = entry.get("contact_id")
        if contact_id not in known or contact_id in seen:
            continue
        seen.add(contact_id)
        rows.append((contact_id, "sent" if entry.get("status") == "sent" else "skipped"))
    return rows


def counts(rows):
    sent = sum(1 for _contact, status in rows if status == "sent")
    skipped = dict.fromkeys(REASONS, 0)
    skipped["failed"] = len(rows) - sent
    return {"reached": len(rows), "sent": sent, "skipped": skipped}


def owner_for(models, organisation_id, cache=None):
    """The workspace's owner, else its first active admin, else its first
    active member, else its first member at all; None for nobody. `cache`
    (a plain dict, shared across a `forwards` run) remembers the answer per
    organisation so every campaign in the same workspace does not repeat
    the same 1-4 queries."""
    if cache is not None and organisation_id in cache:
        return cache[organisation_id]
    owner = (
        models.Membership.objects.filter(
            organisation_id=organisation_id,
            is_owner=True,
            status="active",
            user__is_active=True,
        )
        .values_list("user_id", flat=True)
        .first()
    )
    if owner is None:
        users = models.User.objects.filter(organisation_id=organisation_id).order_by(
            "date_joined", "pk"
        )
        for chosen in (
            users.filter(is_active=True, role__slug="admin"),
            users.filter(is_active=True),
            users,
        ):
            pk = chosen.values_list("pk", flat=True).first()
            if pk is not None:
                owner = pk
                break
    if cache is not None:
        cache[organisation_id] = owner
    return owner


def _in_organisation(organisation_id):
    """A contact inside this organisation only — through its own Customer,
    or through an Account's (never another tenant's), the same shape
    services.customers.contact_sentiment.in_organisation_q uses, kept
    local rather than imported so this migration stays frozen."""
    return Q(customer__organisation_id=organisation_id) | Q(
        account__customers__organisation_id=organisation_id
    )


def _emails(models, campaign_id):
    """{(recipient name, customer id, account id): the first Email row the old send filed}."""
    found = {}
    rows = (
        models.Email.objects.filter(campaign_id=campaign_id)
        .order_by("pk")
        .values_list("pk", "recipient_name", "customer_id", "account_id")
    )
    for pk, name, customer_id, account_id in rows:
        found.setdefault((name, customer_id, account_id), pk)
    return found


def _recovered(models, row, rows, contacts, emails):
    """Extra (contact_id, "sent") rows for anyone the old view actually
    emailed — a real `Email` row filed under this campaign — that
    `send_log` never recorded, because the send was cut off before it
    reached its own finish step (a `sending` campaign most of all, whose
    log can be empty while real sends already went out). Matched back to a
    Contact by (name, customer, account) — the same key `_emails` builds
    the other way — inside the campaign's own organisation, so a
    coincidental name match elsewhere can never leak in. Best effort: a
    name shared by two contacts on the same customer/account resolves to
    whichever this finds first, since the log it would have disambiguated
    with is exactly what is missing."""
    have = {
        (contact["name"][:150], contact["customer_id"], contact["account_id"])
        for contact_id, contact in contacts.items()
    }
    missing = {key for key in emails if key not in have}
    if not missing:
        return rows, contacts
    customer_ids = {key[1] for key in missing if key[1] is not None}
    account_ids = {key[2] for key in missing if key[2] is not None}
    found = (
        models.Contact.objects.filter(
            Q(customer_id__in=customer_ids) | Q(account_id__in=account_ids)
        )
        .filter(_in_organisation(row.organisation_id))
        .values("pk", "name", "customer_id", "account_id")
    )
    extra = []
    for contact in found:
        key = (contact["name"][:150], contact["customer_id"], contact["account_id"])
        if key in missing and contact["pk"] not in contacts:
            contacts[contact["pk"]] = contact
            extra.append((contact["pk"], "sent"))
            missing.discard(key)
    return rows + extra, contacts


def move_campaign(models, row, cache=None):
    owner_id = owner_for(models, row.organisation_id, cache)
    campaigns = models.Campaign.objects.filter(pk=row.pk)
    if owner_id is None:
        campaigns.delete()
        return "deleted"
    changes = {
        "owner_id": owner_id,
        "sharing": "private",
        "name": trim(row.name, NAME) or "Untitled Campaign",
        "subject": trim(row.subject, SUBJECT),
    }
    if row.status not in LEGACY:
        campaigns.update(**changes)
        return "draft"
    if models.CampaignSend.objects.filter(campaign_id=row.pk, migrated=True).exists():
        # An earlier run of this same migration already built this
        # campaign's send (e.g. 0005 was rolled back, which puts
        # `send_log`/`sent_at` back, then 0004 ran again on redeploy).
        # Reapply the campaign's own fields but never build a second send.
        campaigns.update(**changes, status="active")
        return "sent"
    at = row.sent_at or row.updated_at
    log = row.send_log or []
    ids = [entry.get("contact_id") for entry in log if isinstance(entry, dict)]
    known_ids = (
        models.Contact.objects.filter(pk__in=[i for i in ids if isinstance(i, int)])
        .filter(_in_organisation(row.organisation_id))
        .values("pk")
    )
    contacts = {
        c["pk"]: c
        for c in models.Contact.objects.filter(pk__in=known_ids).values(
            "pk", "name", "customer_id", "account_id"
        )
    }
    rows = entries(log, set(contacts))
    emails = _emails(models, row.pk)
    if emails:
        rows, contacts = _recovered(models, row, rows, contacts, emails)
    send = models.CampaignSend.objects.create(
        campaign_id=row.pk,
        kind="manual",
        status="sent",
        started_at=at,
        finished_at=at,
        subject=row.subject or "",
        body=row.body or "",
        counts=counts(rows),
        migrated=True,
    )
    deliveries = []
    for contact_id, status in rows:
        contact = contacts[contact_id]
        key = (contact["name"][:150], contact["customer_id"], contact["account_id"])
        sent = status == "sent"
        deliveries.append(
            models.CampaignDelivery(
                send_id=send.pk,
                contact_id=contact_id,
                status=status,
                reason="" if sent else "failed",
                email_id=emails.get(key) if sent else None,
                sent_at=at if sent else None,
            )
        )
    models.CampaignDelivery.objects.bulk_create(deliveries, batch_size=1000)
    campaigns.update(**changes, status="active")
    return "sent"


def _models(apps):
    return SimpleNamespace(
        Campaign=apps.get_model("campaigns", "Campaign"),
        CampaignSend=apps.get_model("campaigns", "CampaignSend"),
        CampaignDelivery=apps.get_model("campaigns", "CampaignDelivery"),
        Contact=apps.get_model("customers", "Contact"),
        Email=apps.get_model("customers", "Email"),
        User=apps.get_model("accounts", "User"),
        Membership=apps.get_model("identity", "OrganizationMembership"),
    )


def forwards(apps, schema_editor):
    models = _models(apps)
    fields = (
        "pk",
        "organisation_id",
        "status",
        "name",
        "subject",
        "body",
        "send_log",
        "sent_at",
        "updated_at",
    )
    done = Counter()
    owners = {}
    rows = (
        models.Campaign.objects.order_by("organisation_id", "pk")
        .values(*fields)
        .iterator(chunk_size=500)
    )
    for values in rows:
        done[move_campaign(models, SimpleNamespace(**values), owners)] += 1
    if done["deleted"]:
        print(f"\n  campaigns: deleted {done['deleted']} in workspaces with nobody to own them")


def backwards(apps, schema_editor):
    Campaign = apps.get_model("campaigns", "Campaign")
    sent = apps.get_model("campaigns", "CampaignSend").objects.values("campaign_id")
    Campaign.objects.filter(pk__in=sent).update(status="sent")
    Campaign.objects.exclude(pk__in=sent).update(status="draft")


class Migration(migrations.Migration):
    dependencies = [
        ("campaigns", "0003_owner_sends"),
        ("accounts", "0013_totp_device"),
        ("customers", "0052_contact_campaigns_unsubscribed_at"),
        ("identity", "0006_membership_owner"),
    ]

    operations = [migrations.RunPython(forwards, backwards)]
