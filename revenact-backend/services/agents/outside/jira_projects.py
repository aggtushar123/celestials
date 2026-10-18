"""Which Jira project a `jira.create` step goes in when nobody set one (the
connection names none): the runner's own projects, read as the runner
(their Jira link or the connection, as the step would run). One project is
used; several are asked about; none offers to create one. Reads are kept a
short while per connection and seat, so a page, its edit and its run share
one read."""

import re

from django.core.cache import cache

from .. import bulk
from ..kinds import StepFailed
from . import gates, seats, tools

ASK = "Which Jira project should this ticket go in?"
CANT_CREATE = (
    "Your Jira account can't create projects. Ask a Jira admin, or choose an existing project."
)
SUGGESTED = {"name": "Customer Escalations", "key": "CE"}
KEY = re.compile(r"^[A-Z][A-Z0-9]{1,9}$")
NAME_LIMIT = 80
CHOICES = 20
#: Seconds a read is kept (a page, the edit after it and the run share it).
KEEP = 60
#: A person's link creates projects only with this OAuth scope.
PROJECT_SCOPE = "manage:jira-project"


def _tag(connector, seat):
    return f"agents:jira:{connector.pk}:{seat.link_id or 'c'}"


def seat_of(connector, reader):
    """The seat `reader` would run as, or None when it can't be had now (a
    lost or unreachable link: the step's gate says so)."""
    try:
        return seats.for_step(connector, reader)
    except StepFailed:
        return None


def projects(connector, seat, query=""):
    """The seat's projects `[{key, name}]` matching `query` (Jira's first
    page), sorted by name. Raises tools.Refused or tools.ListFailed."""
    key = f"{_tag(connector, seat)}:projects:{query}"
    found = cache.get(key)
    if found is None:
        rows, _more = tools.current().jira.options(
            connector, "jira_projects", query=query, seat=seat
        )
        found = sorted(
            ({"key": r["id"], "name": r["name"]} for r in rows),
            key=lambda r: (r["name"].casefold(), r["key"]),
        )
        cache.set(key, found, KEEP)
    return found


def forget(connector, seat):
    """A project was made: the next read asks Jira again."""
    cache.delete_many([f"{_tag(connector, seat)}:projects:", f"{_tag(connector, seat)}:can_create"])


def known(connector, seat, key):
    """True when `key` is one of the seat's projects, False when it is not,
    None when Jira can't say now."""
    try:
        return any(row["key"] == key for row in projects(connector, seat, key))
    except (tools.Refused, tools.ListFailed):
        return None


def can_create(connector, seat):
    tag = f"{_tag(connector, seat)}:can_create"
    found = cache.get(tag)
    if found is None:
        found = tools.current().jira.can_create_projects(connector, seat=seat)
        cache.set(tag, found, KEEP)
    return found


def suggested(connector, seat, taken=()):
    """SUGGESTED, its key made unique (CE, CE2, ...) against `taken` and Jira."""
    jira, base = tools.current().jira, SUGGESTED["key"]
    for n in range(1, 10):
        key = base if n == 1 else f"{base}{n}"
        if key not in taken and jira.key_free(connector, key=key, seat=seat):
            return {"name": SUGGESTED["name"], "key": key}
    return dict(SUGGESTED)


def _needs(payload):
    return not (payload.get("project") or "")


def choice(step, reader):
    """What the step's preview says of its project for `reader` (only for a
    step with no project that `reader` may run now): `{"project": key}` for
    the one project there is, else `needs_project` with the choices, or the
    offer to create one. {} for anything else."""
    from ..deciding import may_decide

    payload = step.payload if isinstance(step.payload, dict) else {}
    if not _needs(payload) or step.status not in ("proposed", "failed"):
        return {}
    page = bulk.active()
    memo = page.jira_choices if page is not None else {}
    if (step.pk, reader.pk) not in memo:
        memo[(step.pk, reader.pk)] = _choice(step, reader, may_decide)
    return memo[(step.pk, reader.pk)]


def _choice(step, reader, may_decide):
    # SOC2:AUTH-02 only a reader who may run the step reads Jira's projects for it
    if gates.blocked(step, reader) is not None or not may_decide(reader, step):
        return {}
    connector = gates.connector_of(step)
    seat = seat_of(connector, reader)
    if seat is None:
        return {}
    try:
        rows = projects(connector, seat)
    except (tools.Refused, tools.ListFailed):
        return {}
    if len(rows) == 1:
        return {"project": rows[0]["key"]}
    if rows:
        return {"needs_project": True, "project_choices": rows[:CHOICES]}
    able = can_create(connector, seat)
    return {
        "needs_project": True,
        "project_choices": [],
        "can_create_project": able,
        "suggested_project": suggested(connector, seat) if able else None,
    }


def only_project(connector, seat):
    """At run: the seat's one project's key, else "" (none, several, or Jira
    can't say)."""
    try:
        rows = projects(connector, seat)
    except (tools.Refused, tools.ListFailed):
        return ""
    return rows[0]["key"] if len(rows) == 1 else ""


def link_scoped(seat):
    """A person's seat creates projects only when their link holds PROJECT_SCOPE."""
    from services.connectors.models import JiraLink

    if not seat.person:
        return True
    scopes = JiraLink.objects.filter(pk=seat.link_id).values_list("scopes", flat=True).first()
    return PROJECT_SCOPE in (scopes or [])
