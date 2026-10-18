"""Campaign writes, audited (SOC2:LOG-01): `campaign.<verb>`. An event names
the campaign by id only (`target_repr` "Campaign <id>"), never its name,
subject or body; metadata holds ids, field names, kinds and counts. Each
event lands in the same transaction as its write."""

from core import audit


def record(verb, campaign, *, request=None, actor=None, metadata=None):
    audit.record(  # SOC2:LOG-01
        f"campaign.{verb}",
        request=request,
        actor=actor,
        organisation=campaign.organisation,
        target=campaign,
        target_repr=f"Campaign {campaign.pk}",
        metadata=metadata or {},
    )


def record_shared(request, campaign):
    record(
        "shared",
        campaign,
        request=request,
        metadata={
            "sharing": campaign.sharing,
            "shared_with": sorted(campaign.shared_with.values_list("pk", flat=True)),
        },
    )


def changed_fields(campaign, data):
    """The names of the fields `data` would change, never their values."""
    changed = []
    for name, value in data.items():
        if name == "shared_with":
            before = set(campaign.shared_with.values_list("pk", flat=True))
            if {user.pk for user in value} != before:
                changed.append(name)
        elif getattr(campaign, name) != value:
            changed.append(name)
    return sorted(changed)
