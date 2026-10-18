"""The Slack channel list for a Slack step (agent bundles round 2 D2
contract §4.1, R2D2-15 to R2D2-18): the synced channels the reader may post
through and, live, the channels a usable connector's bot is a member of that
no Slack connector in the workspace syncs, read through one connector per
Slack workspace, cached five minutes (names only, never message text).
Private ones are admins' alone."""

from django.core.cache import cache

from services.accounts.capabilities import Capability
from services.connectors.models import Connector
from services.connectors.providers.base import ProviderError

from . import gates

CACHE = "agents:slack-channels:{}"
TTL = 300
LIMIT = 100
NOTE_BUSY = "Slack didn't list its other channels. Try again in a minute."
NOTE_SCOPE = "Add channels:read to the Slack app to choose other channels."
NOT_SYNCED = "Not synced"
NOT_SYNCED_PRIVATE = "Not synced, private"


def admin(user):
    return user.has_capability(Capability.MANAGE_INTEGRATIONS)


def member_channels(connector):
    """[{id, name, private}] for `connector`'s bot, cached. Raises ProviderError."""
    from services.connectors.providers.slack import SlackProvider

    key = CACHE.format(connector.pk)
    rows = cache.get(key)
    if rows is None:
        private = "groups:read" in (connector.granted_scopes or [])
        rows = SlackProvider().member_channels(connector.get_credentials(), private=private)
        cache.set(key, rows, TTL)
    return rows


def synced_ids(organisation_id):
    """Every channel a Slack connection of the workspace includes (Slack
    escalations D3, SC3-18): those are offered as synced, never as live."""
    from services.connectors.models import SlackChannel

    slack = Connector.objects.filter(
        organisation_id=organisation_id, provider=Connector.Provider.SLACK
    ).values("id")
    return set(
        SlackChannel.objects.filter(
            connector_id__in=slack, included=True, is_archived=False
        ).values_list("channel_id", flat=True)
    )


def home_of(payload):
    """The thread's own channel id and name: set at validate since D3."""
    return payload.get("source_channel") or "", payload.get("source_channel_name") or ""


def synced_rows(step, usable):
    """This thread, then every included channel the bot is in of the Slack
    connections `usable` (SC3-18): one query."""
    from services.connectors.models import SlackChannel

    payload = step.payload or {}
    source = payload.get("source_connector_id")
    home, home_name = home_of(payload)
    by_pk = {c.pk: c for c in usable}
    rows = []
    if source in by_pk:
        name = f"#{home_name}" if home_name else gates.channel_name(by_pk[source])
        rows.append({"id": str(source), "name": name, "detail": "This thread"})
    # SOC2:AUTH-02 only included channels of the connections the reader may post through
    found = SlackChannel.objects.filter(
        connector_id__in=list(by_pk), included=True, is_member=True, is_archived=False
    ).order_by("name", "channel_id")
    for ch in found:
        if ch.connector_id == source and ch.channel_id == home:
            continue
        rows.append(
            {
                "id": f"{ch.connector_id}:{ch.channel_id}",
                "name": f"#{ch.name}",
                "detail": "A new message",
            }
        )
    return rows


def _teams(usable, source):
    """One connector per Slack workspace: the source's first, else the lowest
    id. A connector without a stored team id is its own workspace."""
    chosen = {}
    for c in sorted(usable, key=lambda c: (c.pk != source, c.pk)):
        chosen.setdefault((c.config or {}).get("team_id") or f"pk:{c.pk}", c)
    return list(chosen.values())


def parse(choice):
    """ "6" -> (6, ""); "6:C0ESC" -> (6, "C0ESC"). Raises ValueError."""
    if not isinstance(choice, str):
        raise ValueError(choice)
    pk, colon, channel = choice.partition(":")
    if not (pk.isascii() and pk.isdigit()):
        raise ValueError(choice)
    if colon and not (channel.isascii() and channel.isalnum()):
        raise ValueError(choice)
    return int(pk), channel.upper()


def rows(step, reader, *, query):
    """(options, more, note) for `reader` (contract §4.1)."""
    from ..actions.slack_replies import channels

    usable = channels(step, reader)
    source = (step.payload or {}).get("source_connector_id")
    needle = query.strip().casefold()
    found = [r for r in synced_rows(step, usable) if needle in r["name"].casefold()]
    taken = synced_ids(step.organisation_id)
    live, note, may_private = [], None, admin(reader)
    for connector in _teams(usable, source):
        try:
            members = member_channels(connector)
        except ProviderError as exc:
            note = NOTE_SCOPE if exc.code == "missing_scope" else NOTE_BUSY
            continue
        for ch in members:
            # SOC2:AUTH-02 a synced channel is only its connector's row, for its readers;
            # a private channel Revenact doesn't read is an admin's choice (R2D2-15)
            if ch["id"] in taken or (ch["private"] and not may_private):
                continue
            if needle in ch["name"].casefold():
                live.append(
                    {
                        "id": f"{connector.pk}:{ch['id']}",
                        "name": f"#{ch['name']}",
                        "detail": NOT_SYNCED_PRIVATE if ch["private"] else NOT_SYNCED,
                    }
                )
    live.sort(key=lambda r: r["name"].casefold())
    every = found + live
    return every[:LIMIT], len(every) > LIMIT, note
