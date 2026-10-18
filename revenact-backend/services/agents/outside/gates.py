"""Whether an outside step's tool may be used now, for one person (agent
bundles D3 contract §5.1, D3-10): the step payload's disabled state, the
run's refusal and the pick lists' 409 all ask this. Rights come first
(deciding.may_decide); this is only the tool."""

from dataclasses import dataclass

from services.accounts.capabilities import Capability
from services.connectors import agent_access, jira_links
from services.connectors.models import Connector, JiraLink
from services.customers.personal import ticket_departments_readable
from services.mail import agent_send
from services.mail.models import MailboxConnection
from services.metrics.models import AgentAction

from .. import bulk
from . import seats

K = AgentAction.Kind
LINK = "/settings/connections"
SLACK_GONE = "The Slack connection this posts through is gone."
SLACK_RECONNECT = "Reconnect Slack to post this."
SLACK_ALLOW = "Allow Revenact to post in Slack."
SLACK_ASK = "Ask an admin to allow Revenact to post in Slack."
JIRA_GONE = "The Jira connection this uses is gone."
JIRA_RECONNECT = "Reconnect Jira to do this."
JIRA_ALLOW = "Allow agents to act in Jira."
JIRA_ASK = "Ask an admin to allow agents to act in Jira."
TOOLS = (K.SLACK_REPLY, K.JIRA_CREATE, K.JIRA_ASSIGN, K.JIRA_COMMENT)


@dataclass(frozen=True)
class Blocked:
    sentence: str
    #: Where to fix it; None when there is nothing to fix in Settings.
    link: str | None = LINK


def mailbox_of(user):
    page = bulk.active()
    if page is not None:
        return page.mailbox(user)
    return MailboxConnection.objects.filter(user=user).first()


def connector_of(step, key="connector_id"):
    pk = (step.payload or {}).get(key) if isinstance(step.payload, dict) else None
    if not isinstance(pk, int) or isinstance(pk, bool):
        return None
    page = bulk.active()
    if page is not None and step.pk in page.outside_ids:
        return page.connectors.get(pk)
    # SOC2:AUTH-02 only this workspace's connector, never another tenant's
    return Connector.objects.filter(pk=pk, organisation_id=step.organisation_id).first()


def channel_name(connector):
    name = (connector.config or {}).get("channel_name") if connector else ""
    return f"#{name}" if name else "the channel"


def may_read(user, connector):
    # SOC2:AUTH-02 a Slack channel's messages are its connector's department's (visible_tickets)
    return ticket_departments_readable(user, [connector.department])


def _own_thread(reader, step, payload):
    """SE4-25: `step` still replies in the Slack thread it was made from, and
    `reader` took part in that thread."""
    from ..actions.slack_replies import in_thread
    from ..deciding import participates

    # SOC2:AUTH-02 SE4-25: a participant posts their own thread's reply, whatever
    # the connection's department (they wrote in that thread); only that bundle's,
    # and only while it goes to that thread: moved elsewhere, the department rule holds
    return in_thread(payload) and participates(reader, step)


def _own_message(reader, step, payload):
    """Slack bundles: `step` replies to the Slack message `reader` sent to
    their own Work, in that message's own conversation."""
    from ..models import AgentBundle

    if not payload.get("slack_message_id"):
        return False
    bundle = step._state.fields_cache.get("bundle")
    if bundle is None:
        bundle = AgentBundle.objects.filter(pk=step.bundle_id).only("source", "routed_user").first()
    # SOC2:AUTH-02 the sender answers their own message where it was written (they read it
    # in Slack), whatever the connection's department; only their own Slack bundle's step
    return (
        bundle is not None
        and bundle.source == AgentBundle.Source.SLACK_MESSAGE
        and bundle.routed_user_id == reader.pk
    )


def blocked(step, reader):
    if step.kind == K.MAIL_SEND_REPLY:
        sentence = agent_send.blocked(mailbox_of(reader))
        return Blocked(sentence) if sentence else None
    if step.kind in (K.MAIL_COMPOSE, K.MAIL_SEND_DRAFT):
        from ..actions.mail_compose import compose_blocked

        # Guided agent: the draft is written to, and sent from, the runner's own Gmail.
        sentence = compose_blocked(mailbox_of(reader))
        return Blocked(sentence) if sentence else None
    if step.kind not in TOOLS:
        return None
    slack = step.kind == K.SLACK_REPLY
    connector = connector_of(step)
    if connector is None or not connector.is_enabled:
        return Blocked(SLACK_GONE if slack else JIRA_GONE)
    if not agent_access.usable(connector):
        return Blocked(SLACK_RECONNECT if slack else JIRA_RECONNECT)
    if not agent_access.can_act(connector):
        admin = reader.has_capability(Capability.MANAGE_INTEGRATIONS)
        if slack:
            return Blocked(SLACK_ALLOW if admin else SLACK_ASK)
        return Blocked(JIRA_ALLOW if admin else JIRA_ASK)
    if not slack and jira_links.configured():
        link = seats.link_of(reader)
        # SOC2:AUTH-02 a lost link never falls back to the connection's account (R2D2-9)
        if link is not None and link.status == JiraLink.Status.LOST:
            return Blocked(seats.lost_sentence(connector))
    payload = step.payload if isinstance(step.payload, dict) else {}
    if (
        slack
        and not may_read(reader, connector)
        and not _own_thread(reader, step, payload)
        and not _own_message(reader, step, payload)
    ):
        name = payload.get("channel_name")
        return Blocked(f"You can't post in {f'#{name}' if name else channel_name(connector)}.")
    if slack and payload.get("unsynced") and payload.get("channel_private"):
        # SOC2:AUTH-02 only an admin posts in a private channel Revenact doesn't read (R2D2-15)
        if not reader.has_capability(Capability.MANAGE_INTEGRATIONS):
            name = payload.get("channel_name")
            where = f"#{name}" if name else "the channel"
            return Blocked(
                f"Only an admin can post in {where}, a private channel Revenact doesn't read.",
                link=None,
            )
    return None
