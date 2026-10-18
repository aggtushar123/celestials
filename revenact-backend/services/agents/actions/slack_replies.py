"""slack.reply (agent bundles D3 contract §2.2): a reply in the conversation's
Slack thread, posted with the connector's bot token when a person presses
Run (D3-4). A person may move it to another Slack channel Revenact reads,
where it is a new top-level message, or (round 2 D2, R2D2-18) to a channel
the app is in that no connector syncs, also a new top-level message. The
key travels in the message's metadata; every Retry looks first (D3-11).
Can't be undone."""

from rest_framework import serializers

from services.connectors import agent_access
from services.connectors.models import Connector
from services.connectors.providers.base import ProviderError
from services.customers.models import SlackConversation
from services.metrics.models import AgentAction

from .. import bulk, placeholders
from ..edits import checked, text_field
from ..kinds import (
    ASK,
    RECORD_AGENTS,
    ChangedSince,
    FieldErrors,
    Invalid,
    Kind,
    Skipped,
    Stale,
    StepFailed,
)
from ..outside import gates, keys, tools, trail
from .mail_replies import TO_CUSTOMER

TEXT_LIMIT = 3000
EXCERPT = 280
NO_TEXT = "Write the message."
LONG_TEXT = "Keep the message under 3000 characters."
NOT_A_CHANNEL = "Choose a Slack channel Revenact reads."
POSTED = "This Slack message has been posted."
FROM_LIST = "Choose a Slack channel from the list."
NOT_A_MEMBER = "Choose a channel the Revenact app is in."
PRIVATE_ADMIN = "Only an admin can choose a private channel Revenact doesn't read."
CANT_CHECK = "Couldn't check Slack's channels. Try again."
ESCALATION_KEYS = ("ticket_key", "ticket_url")
ONLY_JIRA = "A reply can carry only the Jira key and link of an earlier step."
SHARED_NOW = (
    "This channel is now shared outside your company, so the reply can't carry the Jira link. "
    "Take it out, then Retry."
)


def _shared_now(payload):
    """SE4-7: the conversation's channel is shared outside now (its own flag,
    or its channel row's, SC3-12); True when the conversation is gone."""
    from django.db.models import Exists, OuterRef

    from services.connectors.models import SlackChannel

    pk = payload.get("conversation_id")
    if not isinstance(pk, int) or isinstance(pk, bool):
        return True
    channel_shared = SlackChannel.objects.filter(
        connector=OuterRef("connector"), channel_id=OuterRef("channel"), external_shared=True
    )
    row = (
        SlackConversation.objects.filter(pk=pk)
        .annotate(channel_shared=Exists(channel_shared))
        .values_list("external_shared", "channel_shared")
        .first()
    )
    if row is None:
        return True
    return any(row)


def _carries_ticket(action, payload):
    """An escalation's reply that may no longer carry the Jira key or link
    (channel shared now, or moved) but already holds one filled by an earlier
    run: a failed run keeps its filled payload, so a Retry would post it."""
    if payload.get("escalation") is not True or open_keys(payload, live=True):
        return False
    values = set()
    earlier = AgentAction.objects.filter(bundle_id=action.bundle_id, position__lt=action.position)
    for result in earlier.values_list("result", flat=True):
        outputs = placeholders.outputs_for(result if isinstance(result, dict) else {})
        values.update(outputs[k] for k in ESCALATION_KEYS if k in outputs)
    return any(value in payload["text"] for value in values)


def open_keys(payload, *, live=False):
    """SE4-6: the placeholders an escalation's reply may carry: the Jira key
    and link of an earlier step, only where the channel is not shared outside
    (as proposed, and with `live` as it is now)."""
    if is_message(payload):
        # Slack bundles: the reply may carry the bundle's Jira key and link; Run
        # asks Slack first whether the conversation is shared outside (`_apply_message`).
        return ESCALATION_KEYS
    if not isinstance(payload, dict) or payload.get("escalation") is not True:
        return ()
    if not in_thread(payload):
        # a moved reply is a new message in another channel: never the key or link
        return ()
    if payload.get("external_shared") or (live and _shared_now(payload)):
        return ()
    return ESCALATION_KEYS


def _message_validate(payload, message):
    """Slack bundles: a reply to the Slack message a person sent to Work,
    in its thread (in a direct message, the conversation itself). Where it
    posts comes from the message, never the model."""
    text = str(payload.get("text") or "").strip()
    if not text or len(text) > TEXT_LIMIT:
        raise Invalid("a Slack reply needs text under 3000 characters")
    if not message.get("connector_id"):
        raise Invalid("no Slack connection for this message")
    return {
        "slack_message_id": message["id"],
        "source_connector_id": message["connector_id"],
        "connector_id": message["connector_id"],
        "channel": message["channel"],
        "channel_name": "",
        "source_channel": message["channel"],
        "source_channel_name": "",
        "thread_ts": message["thread_ts"],
        "direct": bool(message["direct"]),
        "text": text,
    }


def is_message(payload):
    """Whether the payload answers a Slack message sent to Work (Slack bundles)."""
    return isinstance(payload, dict) and bool(payload.get("slack_message_id"))


def validate(payload, row, ctx, evidence):
    message = getattr(ctx, "slack_message", None)
    if message is not None and ctx.thread_slack is None:
        return _message_validate(payload, message)
    slack = ctx.thread_slack
    if slack is None or slack["record"] != row["ref"]:
        raise Invalid("not this record's Slack thread")
    text = str(payload.get("text") or "").strip()
    if not text or len(text) > TEXT_LIMIT:
        raise Invalid("a Slack reply needs text under 3000 characters")
    thread = {line.strip() for line in ctx.thread_lines}
    if any(line not in thread for line in evidence):
        raise Invalid("a Slack reply cites only its thread")
    # D3-20: where it posts comes from the thread, never the model.
    clean = {
        "conversation_id": slack["id"],
        "source_connector_id": slack["connector_id"],
        "connector_id": slack["connector_id"],
        "channel": slack["channel"],
        "channel_name": slack["channel_name"],
        "source_channel": slack["channel"],
        "source_channel_name": slack["channel_name"],
        "channel_choice": str(slack["connector_id"]),
        "thread_ts": slack["thread_ts"],
        "text": text,
    }
    if getattr(ctx, "escalation", None) is not None:
        # SE4-6: set by the server for the escalation's own reply, never the model
        clean["escalation"] = True
        clean["external_shared"] = bool(slack.get("external_shared"))
    return clean


def target(payload):
    if is_message(payload):
        # Slack bundles: one reply per Slack message.
        return f"draft:slack_message:{payload['slack_message_id']}"
    # One reply per conversation (D3-18).
    return f"draft:conversation:{payload['conversation_id']}"


def current(action):
    """Always "open": nothing resolves a Slack conversation (SE1-13)."""
    return "open"


def in_thread(payload):
    # R2D2-18: an unsynced channel is always a new top-level message; D3 (SC3-18):
    # so is another channel of the same connection.
    home = payload.get("source_channel") or payload.get("channel")
    return (
        payload.get("connector_id") == payload.get("source_connector_id")
        and not payload.get("unsynced")
        and payload.get("channel") == home
    )


def _label(payload, connector, channel):
    """How a refusal names `channel`: an unsynced one by its own name (R2D2-18);
    a Slack message's own conversation as that."""
    if is_message(payload):
        return "the conversation"
    if channel == payload.get("channel") and payload.get("channel_name"):
        return f"#{payload['channel_name']}"
    return gates.channel_name(connector)


def field_defaults(payload):
    """The panel's `fields` defaults: a step never moved (or proposed before
    round 2 D2) reads its connector's option id (contract §4.2)."""
    if "channel_choice" in payload or "connector_id" not in payload:
        return {}
    return {"channel_choice": str(payload["connector_id"])}


def _posts_as_you(connector, reader):
    """SE4-15: SlackTool.post's own rule, read for `reader`."""
    from services.connectors import slack_links

    if connector is None or reader is None:
        return False
    page = bulk.active()
    link = page.slack_link(reader) if page is not None else slack_links.link_of(reader)
    return slack_links.person_token(link, connector) is not None


def preview(action, reader):
    payload = action.payload if isinstance(action.payload, dict) else {}
    connector = gates.connector_of(action)
    bot = (connector.config or {}).get("bot_name") if connector else ""
    name = payload.get("channel_name")
    you = _posts_as_you(connector, reader)
    if is_message(payload):
        name = ""
        where = "Direct message" if payload.get("direct") else "The message's thread"
    else:
        where = f"#{name}" if name else "Slack"
    return {
        "slack": {
            "channel": where,
            "in_thread": in_thread(payload),
            "synced": not payload.get("unsynced"),
            "as": reader.name if you else (bot or "the Slack app"),
            "as_you": you,
            "excerpt": str(payload.get("text", ""))[:EXCERPT],
        }
    }


def channels(action, reader):
    """The Slack connectors this step may post through for `reader`
    (contract §5.2 `slack_channels`): enabled, able to act and readable
    by them; the source first."""
    rows = Connector.objects.filter(
        organisation_id=action.organisation_id, provider=Connector.Provider.SLACK, is_enabled=True
    ).order_by("pk")
    source = (action.payload or {}).get("source_connector_id")
    found = [c for c in rows if agent_access.can_act(c) and gates.may_read(reader, c)]
    return sorted(found, key=lambda c: c.pk != source)


class _Text(serializers.Serializer):
    text = text_field(TEXT_LIMIT, NO_TEXT, LONG_TEXT)


def _home_payload(action, chosen):
    """Back to the thread's own channel (SC3-18)."""
    payload = action.payload or {}
    home = payload.get("source_channel") or payload.get("channel", "")
    name = payload.get("source_channel_name") or payload.get("channel_name", "")
    return {
        "connector_id": chosen.pk,
        "channel": home,
        "channel_name": name,
        "channel_choice": str(chosen.pk),
        "unsynced": False,
        "channel_private": False,
    }


def _choose(action, choice, runner):
    """The payload for an option id (contract §4.2). Raises FieldErrors."""
    from ..outside import slack_channels

    def refuse(sentence):
        return FieldErrors({"channel_choice": [sentence]})

    try:
        pk, channel = slack_channels.parse(choice)
    except ValueError:
        raise refuse(FROM_LIST) from None
    chosen = next((c for c in channels(action, runner) if c.pk == pk), None)
    if chosen is None:
        raise refuse(NOT_A_CHANNEL)
    payload = action.payload or {}
    source = payload.get("source_connector_id")
    if not channel:
        # "<connection>" alone is the thread's own row (SC3-18)
        if pk != source:
            raise refuse(FROM_LIST)
        return _home_payload(action, chosen)
    from services.connectors.models import SlackChannel

    # SOC2:AUTH-02 a synced channel is an included channel of a connection the runner may use
    synced = SlackChannel.objects.filter(
        connector=chosen, channel_id=channel, included=True, is_member=True, is_archived=False
    ).first()
    if synced is not None:
        if pk == source and channel == payload.get("source_channel"):
            return _home_payload(action, chosen)
        return {
            "connector_id": chosen.pk,
            "channel": channel,
            "channel_name": synced.name,
            "channel_choice": f"{chosen.pk}:{channel}",
            "unsynced": False,
            "channel_private": synced.is_private,
        }
    try:
        members = slack_channels.member_channels(chosen)
    except ProviderError:
        raise refuse(CANT_CHECK) from None
    found = next((m for m in members if m["id"] == channel), None)
    # SOC2:AUTH-02 a synced channel is only its connector's row, for its readers (R2D2-15)
    if found is None or channel in slack_channels.synced_ids(action.organisation_id):
        raise refuse(NOT_A_MEMBER)
    # SOC2:AUTH-02 a private channel Revenact doesn't read is an admin's choice (R2D2-15)
    if found["private"] and not slack_channels.admin(runner):
        raise refuse(PRIVATE_ADMIN)
    return {
        "connector_id": chosen.pk,
        "channel": channel,
        "channel_name": found["name"],
        "channel_choice": f"{chosen.pk}:{channel}",
        "unsynced": True,
        "channel_private": found["private"],
    }


def editable_for(payload):
    """A reply to a Slack message stays in that message's conversation: its text alone."""
    return ("text",) if is_message(payload) else ("connector_id", "channel_choice", "text")


def edit(action, fields, runner):
    if is_message(action.payload) and set(fields) - {"text"}:
        # Slack bundles: where it posts is the message's, never a person's choice.
        raise FieldErrors({key: ["This can't be changed here."] for key in set(fields) - {"text"}})
    errors, clean = {}, {}
    if "channel_choice" in fields:
        try:
            clean.update(_choose(action, fields["channel_choice"], runner))
        except FieldErrors as exc:
            errors.update(exc.errors)
    if "connector_id" in fields:
        pk = fields["connector_id"]
        whole = isinstance(pk, int) and not isinstance(pk, bool)
        chosen = next((c for c in channels(action, runner) if c.pk == pk), None) if whole else None
        if chosen is None:
            errors["connector_id"] = [NOT_A_CHANNEL]
        elif pk != (action.payload or {}).get("source_connector_id"):
            # SOC2:AUTH-02 never the source's channel through another connection's bot
            errors["connector_id"] = [FROM_LIST]
        else:
            clean.update(_home_payload(action, chosen))
    try:
        clean.update(checked(_Text, {"text": fields["text"]} if "text" in fields else {}))
    except FieldErrors as exc:
        errors.update(exc.errors)
    if "text" in clean and placeholders.find({"text": clean["text"]}):
        allowed = open_keys({**action.payload, **clean}, live=True)
        if not allowed:
            errors["text"] = [TO_CUSTOMER]
        else:
            kinds = dict(
                AgentAction.objects.filter(bundle_id=action.bundle_id).values_list(
                    "position", "kind"
                )
            )
            try:
                placeholders.check(
                    {"text": clean["text"]}, action.position, kinds, ("text",), open_keys=allowed
                )
            except Invalid:
                errors["text"] = [ONLY_JIRA]
    if errors:
        raise FieldErrors(errors)
    return {**action.payload, **clean}


def _done(posted, attempt):
    return {"posted": posted.ts}, {
        **attempt,
        "slack_ts": posted.ts,
        "slack_url": posted.url,
        "channel": posted.channel,
        # Connections spec §3: who the post went out as (a lookup can't tell: connection).
        "slack_as": "person" if posted.person else "connection",
    }


def _unconfirmed_places(action):
    """Where an earlier attempt's post went unanswered, each a dict of
    connector_id, channel and thread_ts. A person can move a failed step to
    another channel; a Retry reads these too before posting anywhere."""
    result = action.result if isinstance(action.result, dict) else {}
    places = result.get("unconfirmed_in")
    return [p for p in places if isinstance(p, dict)] if isinstance(places, list) else []


def _connector_for(action, pk, current):
    if current is not None and pk == current.pk:
        return current
    if not isinstance(pk, int) or isinstance(pk, bool):
        return None
    # SOC2:AUTH-02 only this workspace's connector, never another tenant's
    return Connector.objects.filter(pk=pk, organisation_id=action.organisation_id).first()


def _look(action, actor, tool, key, places, attempt, current):
    for place in places:
        connector = _connector_for(action, place.get("connector_id"), current)
        if connector is None:
            continue
        channel = place.get("channel", "")
        try:
            found = tool.find(
                connector,
                channel=channel,
                channel_name=_label(action.payload, connector, channel),
                key=key,
                thread_ts=place.get("thread_ts", ""),
                since=keys.since(action),
            )
        except tools.Refused as exc:
            trail.call(action, actor, tool="slack", op="lookup", outcome="refused", where=channel)
            raise StepFailed(exc.sentence, result=attempt) from None
        trail.call(
            action,
            actor,
            tool="slack",
            op="lookup",
            outcome="found" if found else "not_found",
            where=channel,
            returned=found.ts if found else "",
        )
        if found is not None:
            return found
    return None


def _now_synced(action, channel):
    from ..outside import slack_channels

    return channel in slack_channels.synced_ids(action.organisation_id)


ISSUE_NOT_MADE = "The Jira issue this reply names wasn't made. Take it out, then Retry."
REPLIED = "You already replied to this message from Work."
SHARED = (
    "This conversation is shared outside your company, so the reply can't carry the Jira link. "
    "Take it out, then Retry."
)
CANT_CHECK_SHARED = (
    "Couldn't check whether this conversation is shared outside your company, so the reply "
    "can't carry the Jira link. Take it out, or Retry."
)


def _issue_values(action, message):
    """The Jira keys and links the reply could carry: an earlier step's, and
    the issue its Slack message's card made."""
    values = set()
    earlier = AgentAction.objects.filter(bundle_id=action.bundle_id, position__lt=action.position)
    for result in earlier.values_list("result", flat=True):
        outputs = placeholders.outputs_for(result if isinstance(result, dict) else {})
        values.update(outputs[k] for k in ESCALATION_KEYS if k in outputs)
    if message is not None and message.jira_key:
        values.update(v for v in (message.jira_key, message.jira_url) if v)
    return {value for value in values if value}


def _apply_message(action, actor):
    """Slack bundles: the reply to a Slack message a person sent to Work,
    posted as them (their Slack link, else the bot), once: a reply already
    sent from the card skips the step."""
    from django.utils import timezone

    from services.work.models import SlackSuggestion

    payload = action.payload
    # SOC2:AUTH-02 only the step's own workspace's message
    message = SlackSuggestion.objects.filter(
        pk=payload["slack_message_id"], organisation_id=action.organisation_id
    ).first()
    if message is not None and message.replied_at is not None:
        raise Skipped(REPLIED)
    if placeholders.find({"text": payload["text"]}):
        raise StepFailed(ISSUE_NOT_MADE)
    values = _issue_values(action, message)
    if any(value.lower() in payload["text"].lower() for value in values):
        connector = gates.connector_of(action)
        # SOC2:AUTH-02 SE4-19: never the Jira key or link where people outside may read it
        shared = tools.current().slack.shared(connector, channel=payload["channel"], actor=actor)
        if shared is None:
            raise StepFailed(CANT_CHECK_SHARED)
        if shared:
            raise StepFailed(SHARED)
    after, result = _post(action, actor, payload)
    if message is not None:
        SlackSuggestion.objects.filter(pk=message.pk, replied_at__isnull=True).update(
            replied_at=timezone.now(), reply_url=str(result.get("slack_url") or "")[:500]
        )
    return after, result


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person posts in Slack")
    # SOC2:AUTH-02 the tool's gate again at run: the switch, the grant, the channel's department
    stop = gates.blocked(action, actor)
    if stop is not None:
        raise StepFailed(stop.sentence)
    payload = action.payload
    if is_message(payload):
        return _apply_message(action, actor)
    # SOC2:AUTH-02 SE4-7: a placeholder still in the text, or (on a Retry) a filled
    # Jira key or link, never goes where run_step would not have filled it
    if placeholders.find({"text": payload["text"]}) or _carries_ticket(action, payload):
        raise StepFailed(SHARED_NOW)
    if payload.get("unsynced") and _now_synced(action, payload.get("channel", "")):
        # SOC2:AUTH-02 a channel a connector began syncing since the choice is that
        # connector's department's: the choice no longer stands (R2D2-15)
        raise StepFailed(FROM_LIST)
    return _post(action, actor, payload)


def _people_in(payload):
    """The Slack user ids already in the reply's conversation (its writers and
    the people it names): the only ones the reply may mention (2026-10-18)."""
    pk = payload.get("conversation_id")
    if not pk:
        return frozenset()
    row = SlackConversation.objects.filter(pk=pk).values("people", "messages").first()
    if row is None:
        return frozenset()
    ids = set((row["people"] or {}).keys())
    ids.update(str(m.get("user_id")) for m in row["messages"] or [] if m.get("user_id"))
    return frozenset(ids)


def _post(action, actor, payload):
    """Post `payload`'s text where it says, once: a Retry looks first (D3-11)."""
    connector = gates.connector_of(action)
    thread_ts = payload.get("thread_ts", "") if in_thread(payload) else ""
    channel = payload["channel"]
    label = _label(payload, connector, channel)
    tool, key = tools.current().slack, keys.key_for(action)
    here = {"connector_id": connector.pk, "channel": channel, "thread_ts": thread_ts}
    earlier = _unconfirmed_places(action)
    attempt = {**keys.attempt(action, actor), "unconfirmed_in": earlier}
    if keys.retrying(action):
        places = earlier if here in earlier else [*earlier, here]
        found = _look(action, actor, tool, key, places, attempt, connector)
        if found is not None:
            return _done(found, attempt)
    try:
        posted = tool.post(
            connector,
            channel=channel,
            channel_name=label,
            text=payload["text"],
            thread_ts=thread_ts,
            key=key,
            actor=actor,
            mentions=_people_in(payload),
        )
    except tools.Unconfirmed as exc:
        trail.call(action, actor, tool="slack", op="post", outcome="unconfirmed", where=channel)
        if here not in earlier:
            attempt["unconfirmed_in"] = [*earlier, here]
        raise StepFailed(exc.sentence, result=attempt) from None
    except tools.Refused as exc:
        trail.call(action, actor, tool="slack", op="post", outcome="refused", where=channel)
        raise StepFailed(exc.sentence, result=attempt) from None
    trail.call(
        action, actor, tool="slack", op="post", outcome="ok", where=channel, returned=posted.ts
    )
    return _done(posted, attempt)


def undo(action, actor):
    raise ChangedSince(POSTED)


REPLY = Kind(
    key=AgentAction.Kind.SLACK_REPLY,
    label="Reply in Slack",
    example="Reply in the Slack thread that the fix ships on Friday",
    max_level=ASK,
    agents=RECORD_AGENTS,
    validate=validate,
    target=target,
    same=lambda a, b: target(a) == target(b),
    current=current,
    preview=preview,
    per_reader=True,
    apply=apply,
    undo=undo,
    texts=lambda payload: [payload.get("text")],
    irreversible=True,
    outside=True,
    editable=("connector_id", "channel_choice", "text"),
    edit=edit,
    editable_for=editable_for,
    field_defaults=field_defaults,
    outputs=("slack_ts", "slack_url"),
    customer_facing=("text",),
    open_keys=open_keys,
    cant_undo=POSTED,
)
