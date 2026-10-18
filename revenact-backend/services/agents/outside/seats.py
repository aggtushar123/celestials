"""Who an agent's Jira step acts as (agent bundles round 2 D2 contract §3,
R2D2-2, R2D2-8 to R2D2-11): the runner's own Jira link when it covers the
step's site, else the connection's account. Read through the page's one
link read per reader; refreshed before any step's transaction opens."""

from services.connectors import jira_links
from services.connectors.models import JiraLink
from services.metrics.models import AgentAction

from .. import bulk
from ..kinds import StepFailed
from . import sentences

K = AgentAction.Kind
JIRA_KINDS = (K.JIRA_CREATE, K.JIRA_ASSIGN, K.JIRA_COMMENT)


def link_of(user):
    """`user`'s own Jira link or None: through the page's one read when a page is written."""
    if user is None:
        return None
    page = bulk.active()
    if page is not None:
        return page.jira_link(user)
    # SOC2:AUTH-02 a person acts only through their own link
    return JiraLink.objects.filter(user=user).first()


def lost_sentence(connector):
    """The §3.2 sentence: names the connection's Jira account, else "the Jira connection"."""
    name = ((connector.config or {}).get("account_name") if connector is not None else "") or (
        "the Jira connection"
    )
    return f"Your Jira link stopped working. Link Jira again, or remove the link to act as {name}."


def for_step(connector, actor, attempt=None):
    """The step's seat. Raises StepFailed with the contract's sentence, keeping
    `attempt` (contract §3.6). A refused refresh has already marked the link
    lost and audited it under the row's lock (`jira_links.fresh_token`); the
    StepFailed is caught inside the step's savepoint (`bundle_run.run_step`),
    so that mark commits with the failed step."""
    try:
        return jira_links.seat_for(connector, link_of(actor))
    except jira_links.LinkLost:
        raise StepFailed(lost_sentence(connector), result=attempt) from None
    except jira_links.LinkUnreachable:
        raise StepFailed(sentences.ATLASSIAN_UNREACHABLE, result=attempt) from None


def for_run(connector, actor, attempt):
    """The step's one seat and its trail's `as`; `attempt` keeps who acted (R2D2-10, R2D2-14)."""
    seat = for_step(connector, actor, attempt)
    attempt.update(acted(seat))
    return seat, as_of(seat)


def as_of(seat):
    return "person" if seat.person else "connection"


def acted(seat):
    """What the step's result keeps of who acted (R2D2-10)."""
    return {"acted_as": as_of(seat), "jira_account": seat.name}


def warm(user):
    """Before step transactions open (run_bundle, retry_step): R2D2-8."""
    if user is None or not jira_links.configured():
        return
    jira_links.warm(link_of(user))
