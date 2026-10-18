"""Slack handover (owner, 2026-10-18): "Send to Revenact" on a message that
tags colleagues hands it to each tagged member of the clicker's workspace
who could read it in Slack. Each gets a to-do from the clicker (a `Task`,
told the normal way) and their own copy of the message (a `SlackSuggestion`
they own, `handed_from` the clicker, its card hidden behind the task) whose
agent bundle is theirs alone; the clicker keeps a copy listing whom it went
to (`handed_to`) and gets no plan.

Never to someone who couldn't read it in Slack: a public channel, or a
member of the private channel, group DM or DM, as Slack answers through the
connection's bot (`SlackProvider.channel_readers`). When Slack won't say,
nobody is handed it. Slack and the database only, no model call (the title
comes from the one `draft` call the shortcut already makes), so it stays
inside Slack's 3 seconds; the bundles are proposed on the per-minute tick."""

import re
from dataclasses import dataclass, field
from datetime import timedelta

from django.db import IntegrityError, transaction

from core import audit

from . import slack_text
from .models import SlackLink
from .providers.slack import SlackProvider

TITLE_CHARS = 120
#: A handed task on a record needs a date (`task_dated_unless_todo`): the
#: agent's own default, a week from the workspace's today.
DUE_IN_DAYS = 7
#: The copy's fields `hand_to` sets itself rather than copying the clicker's.
KEPT_APART = ("channel", "message_ts", "customer", "account", "bundle_state")
_LEADING_MENTIONS = re.compile(
    r"^(?:\s*(?:<@[UW][A-Z0-9]+(?:\|[^<>]*)?>|<!(?:here|channel)>)[\s,:;.\-]*)+"
)


@dataclass
class Handover:
    """Who a message went to ([{id, name}]) and who was left out because
    they aren't in the conversation (names), plus the to-dos newly made."""

    handed: list = field(default_factory=list)
    not_in_channel: list = field(default_factory=list)
    tasks: list = field(default_factory=list)


def title_of(raw, drafted, name_of):
    """The to-do's title: the model's when it gave one, else the message as
    Slack showed it without its leading mentions, at most TITLE_CHARS."""
    if drafted:
        return drafted[:TITLE_CHARS]
    rest = _LEADING_MENTIONS.sub("", raw or "", count=1)
    text = " ".join(slack_text.readable(rest, name_of).split())
    if not text:
        return "A Slack message"
    return (text[0].upper() + text[1:])[:TITLE_CHARS]


def tagged_members(raw, *, person, team_id, clicker, info_of):
    """[(Slack user id, member)] for each colleague `raw` tags: an active,
    working member of `person`'s workspace, found by their Slack link there
    or by the email Slack gives (users.info through the bot). Never the
    clicker, a bot, an unknown person or someone without Revenact."""
    from services.accounts.models import User
    from services.work.standing import is_working

    found, seen = [], {person.pk}
    for uid in slack_text.mentioned(raw):
        if uid == clicker:
            continue
        # SOC2:AUTH-02 only a member of the clicker's own workspace is handed a message
        link = (
            SlackLink.objects.filter(
                organisation_id=person.organisation_id,
                team_id=team_id,
                slack_user_id=uid,
                user__is_active=True,
            )
            .select_related("user")
            .first()
        )
        member = link.user if link is not None else None
        if member is None:
            info = info_of(uid)
            if info.get("bot") or not info.get("email"):
                continue
            member = User.objects.filter(
                organisation_id=person.organisation_id, email__iexact=info["email"], is_active=True
            ).first()
        if member is None or member.pk in seen:
            continue
        # SOC2:AUTH-02 a suspended or revoked member is handed nothing
        if not is_working(member, person.organisation_id):
            continue
        seen.add(member.pk)
        found.append((uid, member))
    return found


def who_can_read(members, *, connector, channel):
    """(members who could read the message in Slack, members who couldn't)."""
    if not members:
        return [], []
    # SOC2:AUTH-02 never hand a message to someone who couldn't read it in Slack:
    # a public channel, else a member Slack names; Slack silent means nobody.
    readers = SlackProvider().channel_readers(connector.get_credentials(), channel)
    if readers is None:
        return [m for _, m in members], []
    ok = [m for uid, m in members if uid in readers]
    return ok, [m for uid, m in members if uid not in readers]


def _make_task(member, *, person, record, title, description):
    from services.customers.models import Task
    from services.customers.task_changes import add_task, link
    from services.notifications.models import Notification
    from services.notifications.realtime import notify
    from services.work.clock import today_for

    if record is not None:
        # A task from the clicker on a record the member may open, told as any assignment.
        return add_task(
            parent=record,
            title=title,
            due_date=today_for(person.organisation) + timedelta(days=DUE_IN_DAYS),
            priority=Task.Priority.MEDIUM,
            assignee=member,
            created_by=person,
            actor=person,
            source=Task.Source.MANUAL,
            description=description,
            event_data={"from_slack": True},
        )
    # SOC2:AUTH-02 a task with no record is a to-do, its owner's alone: made as the
    # member's own, the clicker named as who sent it.
    task = add_task(
        parent=None,
        title=title,
        due_date=None,
        priority=Task.Priority.MEDIUM,
        assignee=member,
        created_by=member,
        actor=person,
        source=Task.Source.MANUAL,
        description=description,
        notify_assignee=False,
        event_data={"from_slack": True},
    )
    notify(
        recipient=member,
        actor=person,
        kind=Notification.Kind.TASK_ASSIGNED,
        message=f"{person.name} sent you “{title}” from Slack."[:500],
        link=link(task),
        push_on_commit=True,
    )
    return task


def hand_to(member, *, person, record, title, values):
    """The member's copy of the message and their to-do, once per (channel,
    message, member): the task made, or None when they already have it."""
    from services.customers.scoping import can_open
    from services.work.models import SlackSuggestion

    key = {"owner": member, "channel": values["channel"], "message_ts": values["message_ts"]}
    if SlackSuggestion.objects.filter(**key).exists():
        return None
    # SOC2:AUTH-02 the record is named on the member's to-do and copy only if they may open it
    theirs = record if record is not None and can_open(member, record) else None
    on = {"customer": None, "account": None}
    if theirs is not None:
        on = {"customer": values["customer"], "account": values["account"]}
    description = f"{values['text']}\n\nSent from Slack by {person.name}." + (
        f"\n{values['permalink']}" if values["permalink"] else ""
    )
    try:
        with transaction.atomic():
            task = _make_task(
                member, person=person, record=theirs, title=title, description=description
            )
            SlackSuggestion.objects.create(
                **key,
                **{k: v for k, v in values.items() if k not in KEPT_APART},
                **on,
                organisation_id=member.organisation_id,
                handed_from=person,
                task=task,
                # Their bundle is proposed on the tick, theirs alone.
                bundle_state=SlackSuggestion.BundleState.PENDING,
            )
    except IntegrityError:
        # The same click twice at once: the first one handed it.
        return None
    return task


def hand_over(raw, *, person, connector, team_id, clicker, info_of, record, title, values):
    """Hand the message to every tagged colleague who could read it (a
    Handover). Nobody tagged: an empty Handover, and no Slack call."""
    members = tagged_members(raw, person=person, team_id=team_id, clicker=clicker, info_of=info_of)
    return deliver(
        members, person=person, connector=connector, record=record, title=title, values=values
    )


def deliver(members, *, person, connector, record, title, values):
    """The handover itself, shared by Send to Revenact and a channel message
    whose tags ask for something (slack_tag_checks): `members` from
    `tagged_members`, each who could read it in Slack handed it once per
    (channel, message, member), so either path after the other adds nothing."""
    ok, left_out = who_can_read(members, connector=connector, channel=values["channel"])
    out = Handover(not_in_channel=[m.name for m in left_out])
    for member in ok:
        task = hand_to(member, person=person, record=record, title=title, values=values)
        out.handed.append({"id": member.pk, "name": member.name})
        if task is not None:
            out.tasks.append(task.pk)
    return out


def audit_handover(handover, *, row, person, request=None):
    if not handover.tasks and not handover.not_in_channel:
        return
    audit.record(  # SOC2:LOG-01 ids and counts only: never the message, a title or a name
        "slack.handed_over",
        request=request,
        actor=person,
        organisation=person.organisation,
        target=row,
        target_repr=f"Slack suggestion {row.pk}",
        metadata={
            "handed_to": [p["id"] for p in handover.handed],
            "handed": len(handover.handed),
            "tasks": handover.tasks,
            "not_in_channel": len(handover.not_in_channel),
        },
    )


def _names(names):
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def reply_text(handover, default):
    """The clicker's ephemeral answer: `default` when nothing was handed."""
    if handover.handed:
        names = _names([p["name"] for p in handover.handed])
        text = f"Sent to {names}'s Work in Revenact. Kept in your Work."
    else:
        text = default
    if handover.not_in_channel:
        text += f" Not sent to {_names(handover.not_in_channel)}: they aren't in this channel."
    return text
