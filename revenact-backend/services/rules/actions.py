"""What a rule does to the records it fires on (spec §1.3), as its owner.

The internal actions run at once. The caller runs each record and action
in its own savepoint:
- a task per organisation or account (a contact's lands on its own);
- a lifecycle stage, set under the record's row lock and audited per record
  with the old and new values;
- one notification digest per recipient, naming only records that recipient
  may open.

The survey is customer-facing and goes through `reviews.py`. A status's
`detail` never holds personal data or an exception's text, which can quote
a row's values. Log lines carry ids and exception class names only."""

import logging
from datetime import timedelta

from django.db import transaction

from core import audit
from services.accounts.models import User
from services.campaigns.audience import build as build_reach
from services.campaigns.models import Campaign, CampaignSend
from services.campaigns.sending import Refusal, claim
from services.campaigns.validation import CHOOSE_CAMPAIGN
from services.campaigns.validation import NOBODY as NOBODY_TO_EMAIL
from services.customers.models import Task
from services.customers.task_changes import add_task
from services.notifications.models import Notification
from services.notifications.realtime import notify
from services.plans.access import readable_templates
from services.plans.starting import PlanOpen, owner_for, start_plan
from services.work.standing import is_working

from .access import readable_rules
from .models import Rule
from .records import openable
from .reviews import create_campaign_review

logger = logging.getLogger(__name__)

DONE, UNCHANGED, QUEUED, SKIPPED, FAILED = "done", "unchanged", "queued", "skipped", "failed"
NOUNS = {
    "customer": ("organisation", "organisations"),
    "account": ("account", "accounts"),
    "contact": ("contact", "contacts"),
}
#: A digest names this many organisations or accounts, then counts the rest.
#: Contacts are only counted: their names are personal data.
NAMED = 3
#: The digest's own words are cut to this before the owner's note.
DIGEST_HEAD = 200
NOBODY = "nobody to notify may open it"
NOT_DONE = "could not be done"
#: A survey or campaign action's status when its audience, resolved for
#: the whole night's records, reaches nobody.
NOBODY_TO_REACH = "nobody it could reach"
#: A campaign action's statuses (campaigns spec §4 "Rules additions").
WAITING = "waiting for your review"
EMAILED = "emailed"
CAMPAIGN_UNUSABLE = "its campaign can't be used"
STARTED = "started"
#: The record already has an open plan from the template: nothing to do, as
#: the lifecycle action's "already that stage" (`unchanged`).
ALREADY_HAD_ONE = "already had one"
TEMPLATE_UNUSABLE = "its template can't be used"


def result(action, status, detail=""):
    return {"action": action, "status": status, "detail": detail}


def failed(action, exc):
    """A failure by its class name and a fixed phrase, never its text."""
    return result(action, FAILED, f"{type(exc).__name__}: {NOT_DONE}"[:200])


def parent_of(kind, record):
    """Where a record's task lands: the record itself, or a contact's own
    organisation or account."""
    if kind != "contact":
        return record
    return record.customer if record.customer_id else record.account


def create_task(action, rule, record, kind, *, today, made, working=None):
    """One task per organisation or account per night: `made` holds the
    parents already given one. `record_owner` is the parent's own owner,
    falling back to the rule's owner when there is none or they are not
    active for work (inactive, or their membership suspended or revoked).
    The task is Revenact's (`actor` None): it writes a `created` event and
    tells the assignee, the rule owner included. `working` is the run's
    active-for-work ids (`work.standing`), so no task reads them again;
    without it, the assignee is checked on their own."""
    parent = parent_of(kind, record)
    key = (type(parent).__name__, parent.pk)
    if key in made:
        return result("task", DONE)
    assignee = parent.owner if action["assignee"] == "record_owner" else rule.owner
    # SOC2:AUTH-02 a suspended or revoked owner is given no work: the rule's owner is
    if working is None:
        active = is_working(assignee, rule.organisation_id)
    else:
        active = assignee is not None and assignee.pk in working
    if not active:
        assignee = rule.owner
    add_task(
        parent=parent,
        title=action["title"],
        due_date=today + timedelta(days=action["due_in_days"]),
        priority=Task.Priority.MEDIUM,
        assignee=assignee,
        created_by=rule.owner,
        # Revenact acts: the rule is never named, only its id is kept.
        actor=None,
        source=Task.Source.RULE,
        event_data={"rule": rule.pk},
        working=working,
    )
    made.add(key)
    return result("task", DONE)


def change_lifecycle(action, rule, record, kind, *, today, made):
    """The stage on an organisation or account, read and written under its
    row lock, audited with the old and new values. The same stage is
    `unchanged` and not audited. The lock is `FOR NO KEY UPDATE` (only
    `lifecycle_stage` is written), so it never conflicts with the
    `FOR KEY SHARE` a foreign-key insert takes on the same row."""
    model = type(record)
    row = (
        model.objects.select_for_update(no_key=True, of=("self",))
        .only("pk", "lifecycle_stage")
        .get(pk=record.pk)
    )
    old, new = row.lifecycle_stage, action["stage"]
    if old == new:
        return result("lifecycle", UNCHANGED, old)
    row.lifecycle_stage = new
    row.save(update_fields=["lifecycle_stage"])
    audit.record(  # SOC2:LOG-01
        "rule.field_changed",
        organisation=rule.organisation,
        target=row,
        target_repr=f"{model.__name__} {row.pk}",
        metadata={"rule": rule.pk, "field": "lifecycle_stage", "old": old, "new": new},
    )
    return result("lifecycle", DONE, f"{old} → {new}")


def start_plan_action(action, rule, record, kind, *, today, made):
    """A plan from the action's template on the record, or on a contact's own
    organisation or account, once per parent per night (`made` holds
    `("plan", <model>, <pk>)`, never colliding with the task action's keys).
    The plan's owner is the parent's own owner when they are active and can
    open it, else the rule's owner; it is started through the same
    `plans.starting.start_plan` as the API. A parent with an open plan from
    the template is `unchanged`."""
    parent = parent_of(kind, record)
    key = ("plan", type(parent).__name__, parent.pk)
    if key in made:
        return result("plan", DONE, STARTED)
    # SOC2:AUTH-02 the rule's owner must still be able to read the template
    if not readable_templates(rule.owner).filter(pk=action["template"]).exists():
        return result("plan", FAILED, TEMPLATE_UNUSABLE)
    try:
        start_plan(
            action["template"],
            parent,
            owner=owner_for(parent, rule.owner),
            start_date=today,
            rule=rule,
        )
    except PlanOpen:
        return result("plan", UNCHANGED, ALREADY_HAD_ONE)
    made.add(key)
    return result("plan", DONE, STARTED)


def campaign_statuses(action, rule, run, records, kind, *, today, now):
    """The night's campaign, once for all its records: `{record_id: status}`.
    The campaign must still be the owner's, with a segment of the rule's
    kind. With review, the night's reach is counted (nothing written) and a
    review waits; without review, the night claims the send here, inside
    the rule's transaction (rule, workspace, campaign), and the emails go out
    once every rule has committed (`nightly._finish_night`). Reaching nobody
    makes neither. Call inside a savepoint."""
    ids = [record.pk for record in records]
    campaign = (
        Campaign.objects.select_related("segment", "owner", "organisation")
        .filter(pk=action["campaign"])
        .first()
    )
    usable = (
        campaign is not None
        and campaign.owner_id == rule.owner_id
        and campaign.segment is not None
        and campaign.segment.kind == kind
    )
    if not usable:
        status = result("campaign", FAILED, CAMPAIGN_UNUSABLE)
    elif action["without_review"]:
        try:
            # SOC2:AUTH-02 the claim builds the audience as the campaign's owner, the rule's owner
            claim(
                campaign.pk,
                kind=CampaignSend.Kind.RULE,
                by=None,
                rule=rule,
                records=ids,
                expect_kind=kind,
                expect_owner=rule.owner_id,
                today=today,
                now=now,
            )
            status = result("campaign", DONE, EMAILED)
        except Refusal as refused:
            detail = str(refused.body.get("detail", ""))
            if detail == CHOOSE_CAMPAIGN:
                # changed under the night between its check above and the lock
                status = result("campaign", FAILED, CAMPAIGN_UNUSABLE)
            elif detail == NOBODY_TO_EMAIL:
                status = result("campaign", SKIPPED, NOBODY_TO_REACH)
            else:
                status = result("campaign", FAILED, detail[:200])
    else:
        # SOC2:AUTH-02 counted as the owner, from the fired records they may open
        reach = build_reach(campaign, today=today, now=now, records=ids)
        if not reach.queued:
            status = result("campaign", SKIPPED, NOBODY_TO_REACH)
        else:
            create_campaign_review(rule, run, ids, action, reach)
            status = result("campaign", QUEUED, WAITING)
    return {pk: status for pk in ids}


#: The actions run per record, in the caller's savepoint.
INTERNAL = {"task": create_task, "lifecycle": change_lifecycle, "plan": start_plan_action}


def _what(rule):
    segment = rule.segment.name if rule.segment is not None else "the segment"
    if rule.trigger == Rule.Trigger.ENTERED:
        return f"entered {segment}"
    if rule.trigger == Rule.Trigger.LEFT:
        return f"left {segment}"
    if rule.trigger == Rule.Trigger.CROSSED:
        verb = "fell below" if rule.direction == Rule.Direction.BELOW else "rose above"
        line = format(rule.threshold.normalize(), "f")
        return f"{Rule.Score(rule.score).label} {verb} {line}"
    cadence = "weekly" if rule.cadence == Rule.Cadence.WEEKLY else "monthly"
    return f"came up on the {cadence} schedule"


def digest_message(rule, kind, records, note):
    """ "Renewal watch: Pizza Hut, Initech and 1 more entered At risk ·
    <note>". Organisations and accounts by name, contacts by count."""
    singular, plural = NOUNS[kind]
    count = len(records)
    if kind == "contact":
        who = f"{count} {singular if count == 1 else plural}"
    else:
        shown = sorted(record.name for record in records)
        who = ", ".join(shown[:NAMED])
        if count > NAMED:
            who += f" and {count - NAMED} more"
    head = f"{rule.name}: {who} {_what(rule)}"[:DIGEST_HEAD]
    return f"{head} · {note}" if note else head


def plan_digests(action, rule, records, kind):
    """`{recipient: [records]}` for one notify action: each active person in
    the rule's workspace, told only about records they may open. `me` is the
    rule's owner; `record_owner` groups records by their own owner."""
    if action["to"] == "me":
        wanted = {rule.owner_id: list(records)}
    elif action["to"] == "record_owner":
        wanted = {}
        for record in records:
            owner_id = parent_of(kind, record).owner_id
            if owner_id is not None:
                wanted.setdefault(owner_id, []).append(record)
    else:
        wanted = {pk: list(records) for pk in action["people"]}
    if not wanted:
        return {}
    # SOC2:AUTH-02 only active people in the rule's own workspace are told anything
    people = User.objects.filter(
        pk__in=list(wanted), organisation_id=rule.organisation_id, is_active=True
    ).order_by("pk")
    plan = {}
    for user in people:
        group = wanted[user.pk]
        ids = [record.pk for record in group]
        allowed = set(openable(kind, user, ids).values_list("pk", flat=True))
        mine = [record for record in group if record.pk in allowed]
        if mine:
            plan[user] = mine
    return plan


def send_digests(rule, run, plan, kind, note):
    """One `rule_fired` notification per recipient, each in its own
    savepoint. A recipient who may read the rule gets a link to tonight's
    run; anyone else gets none (that page would be a 404 for them).
    Returns `(told, lost)`: the record ids at least one digest reached, and
    those every digest failed."""
    told, lost = set(), set()
    for user, records in plan.items():
        ids = {record.pk for record in records}
        try:
            with transaction.atomic():
                # SOC2:AUTH-02 the run's link only for someone who may read the rule
                reads = readable_rules(user).filter(pk=rule.pk).exists()
                notify(
                    recipient=user,
                    actor=None,
                    kind=Notification.Kind.RULE_FIRED,
                    message=digest_message(rule, kind, records, note),
                    link=f"/scenarios/rules/{rule.pk}?run={run.pk}" if reads else "",
                    push_on_commit=True,
                )
            told |= ids
        except Exception as exc:  # noqa: BLE001 - one digest's failure never stops the others
            logger.warning(
                "rule %s: digest to user %s not sent: %s", rule.pk, user.pk, type(exc).__name__
            )
            lost |= ids
    return told, lost - told


def notify_statuses(action, rule, run, records, kind):
    """Plans and sends one notify action's digests: `{record_id: status}`."""
    plan = plan_digests(action, rule, records, kind)
    told, lost = send_digests(rule, run, plan, kind, action["message"])
    statuses = {}
    for record in records:
        if record.pk in told:
            statuses[record.pk] = result("notify", DONE)
        elif record.pk in lost:
            statuses[record.pk] = result("notify", FAILED, NOT_DONE)
        else:
            statuses[record.pk] = result("notify", SKIPPED, NOBODY)
    return statuses
