"""A campaign, a send and a delivery as the API returns them (spec §4).

Twice filtered: hand-picked recipients and deliveries are named only to a
reader who may open the contact (`visible_children_q`, as `id IN`
subqueries), the rest counted; a send's rule is named only to a reader who
may read it. A send's `counts` are numbers only and stay whole."""

from django.db.models import Exists, OuterRef, Prefetch, Q
from django.shortcuts import get_object_or_404

from services.accounts.models import User
from services.agents.made_by import RELATED, made_by
from services.customers.models import Contact
from services.customers.scoping import visible_children_q
from services.organizations.rows import iso, person
from services.rules.access import readable_rules
from services.segments.models import Segment
from services.surveys.payloads import segment_ref

from . import paging
from .access import readable_campaigns
from .models import Campaign, CampaignDelivery, CampaignSend, SkipReason

PAGE_SIZE = 50
SEND_PAGE = 20
DELIVERY_PAGE = 50
#: What a reader who may not read a send's rule sees in its place.
A_RULE = "a rule"


def readable_segment_ids(viewer, segment_ids):
    """Which of `segment_ids` `viewer` may read; no query for none.

    Kept local and written the same `pk__in` way as
    `access.readable_campaigns` (never a join plus `.distinct()`, the PG16
    cost #86 fixed); `segment_ref` is pure formatting with no query of its
    own, so it's reused unchanged."""
    ids = {pk for pk in segment_ids if pk is not None}
    if not ids:
        return set()
    named = Segment.shared_with.through.objects.filter(user_id=viewer.pk).values("segment_id")
    # SOC2:AUTH-02 a segment's id is given only to a reader who may open it
    rows = Segment.objects.filter(pk__in=ids, organisation_id=viewer.organisation_id).filter(
        Q(owner=viewer)
        | Q(sharing=Segment.Sharing.WORKSPACE)
        | Q(sharing=Segment.Sharing.PEOPLE, pk__in=named)
    )
    return set(rows.values_list("pk", flat=True))


def annotated(queryset, viewer):
    """What a row needs, in a fixed number of queries: whether it has
    hand-picked recipients or sends, and the teammates it is shared with
    (from the viewer's own workspace only)."""
    through = Campaign.recipients.through.objects.filter(campaign_id=OuterRef("pk"))
    # SOC2:AUTH-02 teammates are named only from the viewer's own workspace
    teammates = User.objects.filter(organisation_id=viewer.organisation_id).order_by("name", "pk")
    return queryset.annotate(
        has_legacy=Exists(through),
        has_sends=Exists(CampaignSend.objects.filter(campaign_id=OuterRef("pk"))),
    ).prefetch_related(Prefetch("shared_with", queryset=teammates, to_attr="teammates"))


def last_sends(campaign_ids):
    """`{campaign_id: its latest send}` in one query (none for no ids)."""
    if not campaign_ids:
        return {}
    sends = (
        CampaignSend.objects.filter(campaign_id__in=campaign_ids)
        .order_by("campaign_id", "-started_at", "-pk")
        .distinct("campaign_id")
    )
    return {send.campaign_id: send for send in sends}


def _last_send_ref(send):
    if send is None:
        return None
    return {
        "id": send.pk,
        "finished_at": iso(send.finished_at),
        "status": send.status,
        "counts": send.counts,
    }


def _row(campaign, viewer, readable, last):
    return {
        "id": campaign.pk,
        "name": campaign.name,
        "status": campaign.status,
        "segment": segment_ref(campaign, readable),
        "roles": campaign.roles,
        "owner": person(campaign.owner),
        "is_owner": campaign.owner_id == viewer.pk,
        "sharing": campaign.sharing,
        "shared_with": [{"id": user.pk, "name": user.name} for user in campaign.teammates],
        "last_send": _last_send_ref(last),
        "needs_segment": (
            campaign.segment_id is None
            and campaign.status == Campaign.Status.DRAFT
            and campaign.has_legacy
        ),
        "updated_at": iso(campaign.updated_at),
        "made_by": made_by(campaign),
    }


def campaign_rows(campaigns, viewer):
    """The list's rows: five queries whatever their number (the campaigns,
    their teammates, the readable segments, the last sends; the annotations
    ride on the first)."""
    campaigns = list(campaigns)
    readable = readable_segment_ids(viewer, [c.segment_id for c in campaigns])
    last = last_sends([c.pk for c in campaigns])
    return [_row(c, viewer, readable, last.get(c.pk)) for c in campaigns]


def list_page(viewer, params):
    """`GET campaigns/?tab=mine|shared&archived=1&cursor=`."""
    campaigns = readable_campaigns(viewer)
    if params.get("tab") == "shared":
        campaigns = campaigns.exclude(owner=viewer)
    else:
        campaigns = campaigns.filter(owner=viewer)
    if params.get("archived") != "1":
        campaigns = campaigns.exclude(status=Campaign.Status.ARCHIVED)
    after = paging.decode_after(params.get("cursor"))
    if after is not None:
        at, pk = after
        campaigns = campaigns.filter(Q(updated_at__lt=at) | Q(updated_at=at, pk__lt=pk))
    ordered = annotated(campaigns, viewer).select_related("owner", "segment", RELATED)
    rows, more = paging.page(ordered.order_by("-updated_at", "-pk"), PAGE_SIZE)
    return {
        "results": campaign_rows(rows, viewer),
        "next": paging.encode(rows[-1].updated_at, rows[-1].pk) if more else None,
    }


def _visible_contacts(viewer):
    # SOC2:AUTH-02 a contact is named only to someone who may open it
    return Contact.objects.filter(visible_children_q(viewer)).values("pk")


def read_campaign(viewer, pk):
    """A campaign `viewer` may read, loaded once with what its payload needs,
    or the same 404 as `access.get_readable`."""
    campaigns = annotated(readable_campaigns(viewer), viewer).select_related(
        "owner", "segment", RELATED
    )
    return get_object_or_404(campaigns, pk=pk)


def campaign_payload(campaign, viewer):
    """The whole campaign. One loaded by `read_campaign` is used as it is;
    any other (after a write) is re-read with its annotations."""
    if not hasattr(campaign, "has_legacy"):
        campaign = (
            annotated(Campaign.objects.filter(pk=campaign.pk), viewer)
            .select_related("owner", "segment", RELATED)
            .get()
        )
    body = campaign_rows([campaign], viewer)[0]
    legacy = campaign.recipients.order_by("name", "pk")
    seen = list(legacy.filter(pk__in=_visible_contacts(viewer)).values_list("pk", "name"))
    body.update(
        {
            "subject": campaign.subject,
            "body": campaign.body,
            "legacy_recipients": [{"id": pk, "name": name} for pk, name in seen],
            "legacy_hidden": legacy.count() - len(seen),
            "can_delete": campaign.owner_id == viewer.pk and not campaign.has_sends,
        }
    )
    return body


def readable_rule_ids(viewer, rule_ids):
    ids = {pk for pk in rule_ids if pk is not None}
    if not ids:
        return set()
    return set(readable_rules(viewer).filter(pk__in=ids).values_list("pk", flat=True))


def _rule_ref(send, readable):
    if send.rule_id is None:
        return None
    if send.rule_id in readable:
        return {"id": send.rule_id, "name": send.rule.name}
    return {"id": None, "name": A_RULE}


def send_payload(send, viewer, readable=None):
    if readable is None:
        readable = readable_rule_ids(viewer, [send.rule_id])
    return {
        "id": send.pk,
        "kind": send.kind,
        "status": send.status,
        "migrated": send.migrated,
        "sent_by": person(send.sent_by),
        "rule": _rule_ref(send, readable),
        "started_at": iso(send.started_at),
        "finished_at": iso(send.finished_at),
        "subject": send.subject,
        "body": send.body,
        "counts": send.counts,
    }


def sends_page(campaign, viewer, params):
    """`GET campaigns/:id/sends/?cursor=`, newest first."""
    sends = campaign.sends.select_related("sent_by", "rule")
    after = paging.decode_after(params.get("cursor"))
    if after is not None:
        at, pk = after
        sends = sends.filter(Q(started_at__lt=at) | Q(started_at=at, pk__lt=pk))
    rows, more = paging.page(sends.order_by("-started_at", "-pk"), SEND_PAGE)
    readable = readable_rule_ids(viewer, [send.rule_id for send in rows])
    return {
        "results": [send_payload(send, viewer, readable) for send in rows],
        "next": paging.encode(rows[-1].started_at, rows[-1].pk) if more else None,
    }


def _record(contact):
    if contact.customer_id:
        return {"kind": "organization", "id": contact.customer_id, "name": contact.customer.name}
    return {"kind": "account", "id": contact.account_id, "name": contact.account.name}


def _delivery_row(delivery):
    contact = delivery.contact
    return {
        "id": delivery.pk,
        "status": delivery.status,
        "reason": delivery.reason,
        "contact": {"id": contact.pk, "name": contact.name},
        "record": _record(contact),
        "sent_at": iso(delivery.sent_at),
    }


def deliveries_page(send, viewer, params):
    """`GET …/deliveries/?status=&reason=&cursor=`: the deliveries whose
    contact the reader may open, in send order, and how many others match."""
    rows = send.deliveries.all()
    if params.get("status") in CampaignDelivery.Status.values:
        rows = rows.filter(status=params["status"])
    if params.get("reason") in SkipReason.values:
        rows = rows.filter(reason=params["reason"])
    seen = _visible_contacts(viewer)
    hidden = rows.exclude(contact_id__in=seen).count()
    visible = rows.filter(contact_id__in=seen).select_related(
        "contact__customer", "contact__account"
    )
    after = paging.decode_id(params.get("cursor"))
    if after is not None:
        visible = visible.filter(pk__gt=after)
    page, more = paging.page(visible.order_by("pk"), DELIVERY_PAGE)
    return {
        "results": [_delivery_row(delivery) for delivery in page],
        "next": paging.encode(page[-1].pk) if more else None,
        "hidden": hidden,
    }
