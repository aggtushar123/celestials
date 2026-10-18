"""`{{step N.key}}` (Agent bundles, contract §6)."""

import re

PATTERN = re.compile(r"\{\{\s*step\s+(\d{1,2})\.([a-z_]+)\s*\}\}")
THINGS = {
    "task": "Task",
    "note": "Note",
    "draft": "Draft",
    "campaign": "Campaign",
    "survey": "Survey",
    "segment": "Segment",
    "rule": "Scenario",
    "canvas": "Map",
    "plan": "Plan",
    "template": "Template",
    "initiative": "Initiative",
    "send": "Send",
    # Agent bundles D3 (contract D3-17).
    "ticket": "Jira ticket",
    "comment": "Jira comment",
    "slack": "Slack message",
    "email": "Email",
}


def find(payload):
    """[(field, position, key)] for every placeholder in a top-level text value."""
    found = []
    for field, value in (payload or {}).items() if isinstance(payload, dict) else ():
        if isinstance(value, str):
            found += [(field, int(n), key) for n, key in PATTERN.findall(value)]
    return found


#: SE4-6: the only producers a customer-facing field may read from.
OPEN_PRODUCERS = ("jira.create", "jira.assign")


def label(n, key):
    if key == "ticket_key":
        return f"Jira key from step {n}"
    if key == "ticket_url":
        return f"Jira link from step {n}"
    thing, _, tail = key.rpartition("_")
    name = THINGS.get(thing, thing.replace("_", " ").capitalize() or "Result")
    return f"{name} link from step {n}" if tail == "url" else f"{name} from step {n}"


#: id key -> (link key, link), contract §6.2. Links are app paths.
LINKS = {
    "task_id": ("task_url", "/work/mine?task={}"),
    "campaign_id": ("campaign_url", "/campaigns/{}"),
    "survey_id": ("survey_url", "/surveys/{}"),
    "segment_id": ("segment_url", "/segments/{}"),
    "rule_id": ("rule_url", "/scenarios/rules/{}"),
    "canvas_id": ("canvas_url", "/canvas/{}"),
}
IDS = (
    "note_id",
    "draft_id",
    "plan_id",
    "template_id",
    "initiative_id",
    "send_id",
    "email_id",
    *LINKS,
)
#: Outside results (contract D3-17): text, not ids. Their links are the
#: tool's own https pages, kept as the tool gave them.
TEXTS = ("ticket_key", "ticket_url", "slack_ts", "slack_url", "comment_url")
NEEDS = "Needs step {n}, which didn't run."


class NeedsStep(Exception):
    def __init__(self, position):
        super().__init__(position)
        self.position = position


def needs_sentence(n):
    return NEEDS.format(n=n)


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def outputs_for(result):
    """A step's `outputs` from its `result`: its ids, a link per id with a
    page, and an outside step's keys and links."""
    out = {}
    for key in IDS:
        value = (result or {}).get(key)
        if _whole(value):
            out[key] = value
            if key in LINKS:
                link_key, pattern = LINKS[key]
                out[link_key] = pattern.format(value)
    for key in TEXTS:
        value = (result or {}).get(key)
        if isinstance(value, str) and value:
            out[key] = value
    return out


def check(payload, position, kinds_by_position, customer_facing=(), open_keys=()):
    """Invalid when a placeholder names this or a later step, or a key the
    producing step's kind does not make, or sits in a `customer_facing`
    field: a customer never reads a step's output (contract §6.1), except
    the `open_keys` of a Jira step (Slack escalations D4, SE4-6)."""
    from .kinds import Invalid
    from .registry import REGISTRY

    for field, n, key in find(payload):
        producer = kinds_by_position.get(n)
        if field in customer_facing and not (key in open_keys and producer in OPEN_PRODUCERS):
            raise Invalid("a placeholder in text a customer reads")
        if n >= position or producer is None or key not in REGISTRY[producer].outputs:
            raise Invalid("a placeholder names no earlier step's output")


def fill(payload, outputs_by_position, skip=(), open_keys=()):
    """`payload` with every placeholder replaced; NeedsStep for the first
    producing step that did not run or lacks the key (contract §6.3). The
    fields in `skip` (a kind's customer-facing ones) are left as written,
    but for their `open_keys` (SE4-6): a customer never reads a step's output (D3-17)."""

    def replace(match):
        n, key = int(match.group(1)), match.group(2)
        outputs = outputs_by_position.get(n) or {}
        if key not in outputs:
            raise NeedsStep(n)
        return str(outputs[key])

    def open_only(match):
        return replace(match) if match.group(2) in open_keys else match.group(0)

    if not isinstance(payload, dict):
        return payload
    return {
        field: (PATTERN.sub(open_only if field in skip else replace, value))
        if isinstance(value, str)
        else value
        for field, value in payload.items()
    }


def renumber(payload, mapping):
    """`payload` with each `{{step N.key}}` pointing at `mapping[N]` (the
    model's Nth step for this record -> its position in the bundle).
    Invalid when N is not a step this pass placed in the bundle."""
    from .kinds import Invalid

    def replace(match):
        n = int(match.group(1))
        if n not in mapping:
            raise Invalid("a placeholder names a step that is not in the bundle")
        return f"{{{{step {mapping[n]}.{match.group(2)}}}}}"

    if not isinstance(payload, dict):
        return payload
    return {
        field: PATTERN.sub(replace, value) if isinstance(value, str) else value
        for field, value in payload.items()
    }
