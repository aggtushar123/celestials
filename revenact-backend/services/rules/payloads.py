"""A rule as the API returns it: the detail and the list's row. A night's
counts are the owner's: they came from the owner's book (spec §3)."""

import json
from base64 import urlsafe_b64decode, urlsafe_b64encode
from datetime import date

from django.db.models import Count, Q

from services.agents.made_by import made_by
from services.campaigns.audience import build
from services.campaigns.models import Campaign
from services.customers.models import Contact
from services.organizations.rows import iso, number, person
from services.plans.models import OPEN, Plan, PlanTemplate
from services.segments.access import readable_segments

from .models import Rule, RuleReview, RuleRun, RuleRunRecord
from .records import names, visible_q


def readable_segment_ids(viewer, segment_ids):
    """Which of `segment_ids` `viewer` may read; no query for none."""
    ids = {pk for pk in segment_ids if pk is not None}
    if not ids:
        return set()
    return set(readable_segments(viewer).filter(pk__in=ids).values_list("pk", flat=True))


def segment_ref(rule, readable):
    """The rule's segment by name and kind; its id only for a reader who may
    open it. None once the segment is deleted."""
    segment = rule.segment
    if segment is None:
        return None
    return {
        "id": segment.pk if segment.pk in readable else None,
        "name": segment.name,
        "kind": segment.kind,
    }


def template_names(rules):
    """`{template_id: name}` for every `plan` action of `rules`, in one query
    (none when no rule starts plans)."""
    ids = {a["template"] for rule in rules for a in rule.actions if a["action"] == "plan"}
    if not ids:
        return {}
    return dict(PlanTemplate.objects.filter(pk__in=ids).values_list("pk", "name"))


def campaign_names(rules):
    """`{campaign_id: name}` for every `campaign` action of `rules`, in one
    query (none when no rule sends a campaign)."""
    ids = {a["campaign"] for rule in rules for a in rule.actions if a["action"] == "campaign"}
    if not ids:
        return {}
    return dict(Campaign.objects.filter(pk__in=ids).values_list("pk", "name"))


def action_refs(actions, names, campaigns=None):
    """A rule's actions as the API reads them: a `plan` action's template and
    a `campaign` action's campaign as `{id, name}`, or None once deleted."""
    campaigns = campaigns or {}
    shown = []
    for action in actions:
        if action["action"] == "plan":
            pk = action["template"]
            action = {**action, "template": {"id": pk, "name": names[pk]} if pk in names else None}
        elif action["action"] == "campaign":
            pk = action["campaign"]
            ref = {"id": pk, "name": campaigns[pk]} if pk in campaigns else None
            action = {**action, "campaign": ref}
        shown.append(action)
    return shown


#: A night's reviews are listed survey first.
KIND_ORDER = {RuleReview.Kind.SURVEY: 0, RuleReview.Kind.CAMPAIGN: 1}


def reviews_of(run):
    """The night's reviews, survey first. Reads the `prefetch_related` cache."""
    return sorted(run.reviews.all(), key=lambda review: (KIND_ORDER[review.kind], review.pk))


def last_runs(rule_ids):
    """`{rule_id: its latest night}`, two queries (none for no ids)."""
    if not rule_ids:
        return {}
    runs = (
        RuleRun.objects.filter(rule_id__in=rule_ids)
        .prefetch_related("reviews")
        .order_by("rule_id", "-run_on", "-pk")
        .distinct("rule_id")
    )
    return {run.rule_id: run for run in runs}


def last_run_ref(run, is_owner):
    if run is None:
        return None
    reviews = reviews_of(run) if is_owner else []
    return {
        "run_on": iso(run.run_on),
        "fired": run.fired if is_owner else None,
        "waiting": any(review.status == RuleReview.Status.WAITING for review in reviews),
    }


def _row(rule, viewer, readable, run, names, campaigns):
    is_owner = rule.owner_id == viewer.pk
    return {
        "id": rule.pk,
        "name": rule.name,
        "is_active": rule.is_active,
        "paused_reason": rule.paused_reason,
        "paused_message": Rule.Paused(rule.paused_reason).label if rule.paused_reason else "",
        "segment": segment_ref(rule, readable),
        "trigger": rule.trigger,
        "score": rule.score,
        "direction": rule.direction,
        "threshold": number(rule.threshold),
        "cadence": rule.cadence,
        "weekday": rule.weekday,
        "actions": action_refs(rule.actions, names, campaigns),
        "cooldown_days": rule.cooldown_days,
        "sharing": rule.sharing,
        "owner": person(rule.owner),
        "is_owner": is_owner,
        "last_run": last_run_ref(run, is_owner),
        "updated_at": iso(rule.updated_at),
        "made_by": made_by(rule),
    }


def rule_payload(rule, viewer):
    body = _row(
        rule,
        viewer,
        readable_segment_ids(viewer, [rule.segment_id]),
        last_runs([rule.pk]).get(rule.pk),
        template_names([rule]),
        campaign_names([rule]),
    )
    # SOC2:AUTH-02 teammates are named only from the viewer's own workspace
    teammates = (
        rule.shared_with.filter(organisation_id=viewer.organisation_id)
        .order_by("name", "pk")
        .values_list("pk", "name")
    )
    body["shared_with"] = [{"id": pk, "name": name} for pk, name in teammates]
    body["created_at"] = iso(rule.created_at)
    return body


def list_rows(rules, viewer):
    """The list's rows: five queries whatever their number (the rules, the
    readable segments, the last nights, the templates when any rule starts
    plans, and the campaigns when any rule sends one)."""
    rules = list(rules)
    readable = readable_segment_ids(viewer, [rule.segment_id for rule in rules])
    runs = last_runs([rule.pk for rule in rules])
    names = template_names(rules)
    campaigns = campaign_names(rules)
    return [_row(rule, viewer, readable, runs.get(rule.pk), names, campaigns) for rule in rules]


#: How many records the builder's test names; the rest are in `count`.
TEST_NAMED = 10


def preview_payload(selection):
    """The builder's test: how many would be acted on tonight, the first
    `TEST_NAMED` by name (all openable by the caller, who is the owner), the
    count they may not open, and what the cooldown and cap would skip."""
    first = selection.fire[:TEST_NAMED]
    found = names(selection.kind, first)
    skipped = selection.skipped()
    # the test runs no action, so nothing failed or reached nobody
    del skipped["failed"], skipped["nobody"]
    return {
        "count": len(selection.fire),
        "records": [
            {"kind": selection.kind, "id": pk, "name": found[pk]} for pk in first if pk in found
        ],
        "hidden_count": selection.not_visible,
        "skipped": skipped,
    }


def parent_keys(kind, ids):
    """The organisations and accounts `ids` would put plans on: the records
    themselves, or for contacts their own organisation or account."""
    if kind != "contact":
        return {(kind, pk) for pk in ids}
    rows = Contact.objects.filter(pk__in=list(ids)).values_list("customer_id", "account_id")
    return {("customer", c) if c is not None else ("account", a) for c, a in rows}


def plan_preview(rule, selection):
    """The builder's test for a `plan` action: how many plans tonight would
    start, and how many of tonight's records already have an open plan from
    the template. None for a rule without a `plan` action. At most one open
    plan per record and template (the partial unique constraint), so a count
    of open plans is a count of records."""
    action = next((a for a in rule.actions if a["action"] == "plan"), None)
    if action is None:
        return None
    parents = parent_keys(selection.kind, selection.fire)
    open_plans = Plan.objects.filter(template_id=action["template"], status__in=OPEN)
    customers = [pk for kind, pk in parents if kind == "customer"]
    accounts = [pk for kind, pk in parents if kind == "account"]
    already = 0
    if customers:
        already += open_plans.filter(customer_id__in=customers).count()
    if accounts:
        already += open_plans.filter(account_id__in=accounts).count()
    return {"would_start": len(parents) - already, "already_open": already}


def campaign_preview(rule, selection, *, today, now):
    """The builder's test for a `campaign` action: how many tonight's records
    would email and how many they would skip, as the owner (the caller).
    None for a rule without a `campaign` action."""
    action = next((a for a in rule.actions if a["action"] == "campaign"), None)
    if action is None:
        return None
    campaign = (
        Campaign.objects.select_related("segment", "owner").filter(pk=action["campaign"]).first()
    )
    if (
        campaign is None
        or campaign.segment is None
        # moved to a segment of another kind since the rule was saved: tonight's
        # ids are not its records (the night itself refuses this campaign)
        or campaign.segment.kind != selection.kind
        or not selection.fire
    ):
        return {"would_email": 0, "skipped": 0}
    # SOC2:AUTH-02 counted as the campaign's owner, who is the rule's owner and the caller
    reach = build(campaign, today=today, now=now, records=selection.fire)
    return {"would_email": reach.reach, "skipped": len(reach.skipped)}


#: A rule's nights, a page at a time.
PAGE_SIZE = 20


def encode_cursor(run):
    raw = json.dumps([run.run_on.isoformat(), run.pk])
    return urlsafe_b64encode(raw.encode()).decode()


def decode_cursor(cursor):
    """(run_on, id) after which the next page starts, or None (the first
    page) for a missing, malformed or tampered cursor."""
    if not cursor:
        return None
    try:
        day, pk = json.loads(urlsafe_b64decode(cursor.encode()))
        return date.fromisoformat(day), int(pk)
    except (ValueError, TypeError):
        return None


def tallies(run_ids, viewer):
    """`{run_id: {total, seen, seen_fired}}` in one query: every record row,
    those whose record the viewer may open now, and those of them that fired."""
    if not run_ids:
        return {}
    seen = visible_q(viewer)
    rows = (
        RuleRunRecord.objects.filter(run_id__in=run_ids)
        .order_by()
        .values("run_id")
        .annotate(
            total=Count("id"),
            seen=Count("id", filter=seen),
            seen_fired=Count("id", filter=seen & Q(outcome=RuleRunRecord.Outcome.FIRED)),
        )
    )
    return {row["run_id"]: row for row in rows}


def runs_page(rule, viewer, params):
    """`?cursor=`: the rule's nights, newest first, `PAGE_SIZE` a page. The
    owner reads each night's own counts and review. Anyone else reads how
    many fired among the records they may open now, and of the rest only
    `hidden_count`."""
    is_owner = rule.owner_id == viewer.pk
    runs = rule.runs.prefetch_related("reviews").order_by("-run_on", "-pk")
    after = decode_cursor(params.get("cursor"))
    if after is not None:
        day, pk = after
        runs = runs.filter(Q(run_on__lt=day) | Q(run_on=day, pk__lt=pk))
    page = list(runs[: PAGE_SIZE + 1])
    more = len(page) > PAGE_SIZE
    page = page[:PAGE_SIZE]
    # SOC2:AUTH-02 a reader's figures cover only the records they may open now
    counted = tallies([run.pk for run in page], viewer)
    results = []
    for run in page:
        tally = counted.get(run.pk, {"total": 0, "seen": 0, "seen_fired": 0})
        reviews = reviews_of(run) if is_owner else []
        first = reviews[0] if reviews else None
        results.append(
            {
                "id": run.pk,
                "run_on": iso(run.run_on),
                "matched": run.matched if is_owner else None,
                "fired": run.fired if is_owner else tally["seen_fired"],
                "skipped": run.skipped if is_owner else None,
                "review": None if first is None else {"id": first.pk, "status": first.status},
                "reviews": [
                    {"id": review.pk, "kind": review.kind, "status": review.status}
                    for review in reviews
                ],
                "hidden_count": tally["total"] - tally["seen"],
                "started_at": iso(run.started_at),
                "finished_at": iso(run.finished_at),
            }
        )
    return {"results": results, "next": encode_cursor(page[-1]) if more else None}


def run_detail(run, viewer):
    """A night's records the viewer may open now, fired first, by name; the
    rest (deleted ones included) are `hidden_count`. At most 400 rows (200
    fired or failed, 200 for the cooldown), so unpaginated."""
    # SOC2:AUTH-02 a night's record is named only to someone who may open it today
    rows = list(run.records.filter(visible_q(viewer)).order_by("outcome", "record_id"))
    hidden = run.records.count() - len(rows)
    found = {}
    for kind in sorted({row.record_kind for row in rows}):
        ids = [row.record_id for row in rows if row.record_kind == kind]
        found.update({(kind, pk): name for pk, name in names(kind, ids).items()})
    return {
        "id": run.pk,
        "run_on": iso(run.run_on),
        "records": [
            {
                "kind": row.record_kind,
                "id": row.record_id,
                "name": found.get((row.record_kind, row.record_id)),
                "outcome": row.outcome,
                "reason": row.reason,
                "actions": row.actions,
            }
            for row in rows
        ],
        "hidden_count": hidden,
    }


def review_campaign_names(reviews):
    """`{campaign_id: name}` for the campaign reviews among `reviews`, one query."""
    ids = {r.action.get("campaign") for r in reviews if r.kind == RuleReview.Kind.CAMPAIGN}
    if not ids:
        return {}
    return dict(Campaign.objects.filter(pk__in=ids).values_list("pk", "name"))


def review_payload(review, campaigns=None):
    """A review as its owner reads it: the rule's sentence, the night, the
    frozen survey or campaign action, how many it reaches, and the
    workspace's name for the survey's preview. A campaign review also names
    its campaign (None once deleted). Records are counted, never named.
    Needs `rule__segment`, `rule__organisation` and `run` loaded."""
    rule, segment = review.rule, review.rule.segment
    body = {
        "id": review.pk,
        "kind": review.kind,
        "rule": {
            "id": rule.pk,
            "name": rule.name,
            "trigger": rule.trigger,
            "score": rule.score,
            "direction": rule.direction,
            "threshold": number(rule.threshold),
            "cadence": rule.cadence,
            "weekday": rule.weekday,
            "segment": None
            if segment is None
            else {"id": segment.pk, "name": segment.name, "kind": segment.kind},
        },
        "run_on": iso(review.run.run_on),
        "action": review.action,
        "counts": review.counts,
        "organisation_name": rule.organisation.name,
        "status": review.status,
        "result": review.result,
        "created_at": iso(review.created_at),
        "expires_at": iso(review.expires_at),
        "decided_at": iso(review.decided_at),
    }
    if review.kind == RuleReview.Kind.CAMPAIGN:
        names = review_campaign_names([review]) if campaigns is None else campaigns
        pk = review.action.get("campaign")
        body["campaign"] = {"id": pk, "name": names[pk]} if pk in names else None
    return body
