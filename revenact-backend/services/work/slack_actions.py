"""The two things a Slack message sent to Work does, one click each (owner,
2026-10-16): a Jira issue, as the person (their Jira link, else the
connection), in SLACK_JIRA_PROJECT or the connection's project, made once;
and the person's reply to the sender, as them (their Slack link, else the
bot where it may post), posted once. Both reuse the agents' outside tools,
so a refusal reads as it does in a bundle."""

from urllib.parse import urlsplit

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from core import audit
from services.agents.outside import tools

from .models import SlackSuggestion

ISSUE = "{issue}"
REPLY_CHARS = 3000
NO_JIRA = "Connect Jira in Settings › Connections first."
NO_PROJECT = "Set a Jira project for new issues (Workspace › Jira) first."
NO_SLACK = "This Slack workspace isn't connected any more. Reconnect Slack first."
LINK_LOST = "Your Jira link needs reconnecting (Your accounts › Jira)."
EMPTY = "Write the reply first."
TOO_LONG = f"Keep the reply under {REPLY_CHARS:,} characters."
ISSUE_FIRST = "Create the Jira issue first, or take {issue} out of the reply."
REPLIED = "You already replied to this message."
SHARED = (
    "This conversation is shared outside your company, so the reply can't carry the Jira link. "
    "Take it out, then send."
)
CANT_CHECK = (
    "Couldn't check whether this conversation is shared outside your company, so the reply "
    "can't carry the Jira link. Take it out, or try again."
)
#: The issue types tried in order; else the project's first.
TYPES = ("Bug", "Task")


class Refusal(Exception):
    def __init__(self, sentence, status=400):
        super().__init__(sentence)
        self.sentence, self.status = sentence, status


def jira_connector(organisation_id):
    """The workspace's connected, enabled Jira connection, or None."""
    from services.connectors.models import Connector

    return (
        Connector.objects.filter(
            organisation_id=organisation_id,
            provider=Connector.Provider.JIRA,
            is_enabled=True,
        )
        .exclude(credentials="")
        .order_by("pk")
        .first()
    )


def project_of(connector):
    return settings.SLACK_JIRA_PROJECT or (connector.config or {}).get("project", "") or ""


def slack_connector(row):
    """The connection to the Slack workspace the message came from, or None."""
    from services.connectors.slack_interactivity import _team_connectors

    return next(
        (c for c in _team_connectors(row.team_id) if c.organisation_id == row.organisation_id),
        None,
    )


def _label(row):
    return f"revenact-slack-{row.pk}"


def _seat(connector, person):
    from services.agents.outside import seats
    from services.connectors import jira_links

    try:
        return jira_links.seat_for(connector, seats.link_of(person))
    except jira_links.LinkLost:
        raise Refusal(LINK_LOST) from None
    except jira_links.LinkUnreachable:
        return jira_links.connection_seat(connector)


def _type_id(tool, connector, project, seat):
    types = tool.issue_types(connector, project, seat=seat)
    by_name = {t["name"].casefold(): t["id"] for t in types}
    for name in TYPES:
        if name.casefold() in by_name:
            return by_name[name.casefold()]
    if not types:
        raise Refusal(f"Jira offers no issue type in {project}.")
    return types[0]["id"]


def create_issue(row, person, *, summary="", description="", request=None):
    """(key, url) of the row's Jira issue, made now or before. Raises Refusal."""
    from services.connectors.providers.jira import adf

    if row.jira_key:
        return row.jira_key, row.jira_url
    connector = jira_connector(row.organisation_id)
    if connector is None:
        raise Refusal(NO_JIRA)
    project = project_of(connector)
    if not project:
        raise Refusal(NO_PROJECT)
    tool, seat = tools.current().jira, _seat(connector, person)
    issue = None
    try:
        if row.jira_attempted_at is not None:
            # The last create may have reached Jira without its answer reaching us.
            issue = tool.find(connector, label=_label(row), project=project, seat=seat)
        if issue is None:
            SlackSuggestion.objects.filter(pk=row.pk).update(jira_attempted_at=timezone.now())
            fields = {
                "project": {"key": project},
                "issuetype": {"id": _type_id(tool, connector, project, seat)},
                "summary": (summary or row.jira_summary or row.summary)[:200],
                "description": adf(
                    description or row.jira_description or row.text,
                    f"Created by {person.name} from a Slack message, in Revenact.",
                ),
                "labels": [_label(row)],
            }
            issue = tool.create(connector, fields=fields, project=project, seat=seat)
    except (tools.Refused, tools.Unconfirmed) as exc:
        raise Refusal(exc.sentence) from None
    with transaction.atomic():
        SlackSuggestion.objects.filter(pk=row.pk).update(
            jira_key=issue.key[:32], jira_url=issue.url[:500]
        )
        audit.record(  # SOC2:LOG-01 a person made a Jira issue from their Slack message
            "slack.jira_created",
            request=request,
            actor=person,
            organisation=person.organisation,
            target=row,
            target_repr=f"Slack suggestion {row.pk}",
            metadata={"issue": issue.key},
        )
    return issue.key, issue.url


def _carries_issue(row, text):
    """The row's key or link in any case, or any link to its Jira site's issues."""
    if not row.jira_key:
        return False
    low = text.lower()
    if row.jira_key.lower() in low or (row.jira_url and row.jira_url.lower() in low):
        return True
    host = urlsplit(row.jira_url).netloc.lower()
    return bool(host) and f"{host}/browse/" in low


def send_reply(row, person, text, *, request=None):
    """The reply's link; posted as the person, in the message's thread (in a
    direct message, the conversation itself). Raises Refusal."""
    text = (text or "").strip()
    if not text:
        raise Refusal(EMPTY)
    if ISSUE in text:
        if not row.jira_key:
            raise Refusal(ISSUE_FIRST)
        text = text.replace(ISSUE, f"{row.jira_key} ({row.jira_url})")
    if len(text) > REPLY_CHARS:
        raise Refusal(TOO_LONG)
    if row.replied_at is not None:
        raise Refusal(REPLIED, status=409)
    connector = slack_connector(row)
    if connector is None:
        raise Refusal(NO_SLACK)
    if _carries_issue(row, text):
        # SOC2:AUTH-02 SE4-19: never the Jira key or link where people outside may read it
        shared = tools.current().slack.shared(connector, channel=row.channel, actor=person)
        if shared is None:
            raise Refusal(CANT_CHECK)
        if shared:
            raise Refusal(SHARED)
    direct = row.channel.startswith("D")
    try:
        posted = tools.current().slack.post(
            connector,
            channel=row.channel,
            channel_name="",
            text=text,
            thread_ts="" if direct else row.message_ts,
            key=f"rv-slack-{row.pk}",
            actor=person,
        )
    except (tools.Refused, tools.Unconfirmed) as exc:
        raise Refusal(exc.sentence) from None
    with transaction.atomic():
        SlackSuggestion.objects.filter(pk=row.pk).update(
            replied_at=timezone.now(), reply_url=posted.url[:500]
        )
        # SOC2:LOG-01 a person replied in Slack from their Work; never the text
        audit.record(
            "slack.reply_sent",
            request=request,
            actor=person,
            organisation=person.organisation,
            target=row,
            target_repr=f"Slack suggestion {row.pk}",
            metadata={},
        )
    return posted.url
