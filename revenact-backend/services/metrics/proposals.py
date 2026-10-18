"""The Ops agent: proposals into the review queue.

Reads what the brain knows — the metric layer, what moved, the cuts, the
accounts carrying the downside, who owns what, which decisions are already
open — and proposes concrete next actions. Two kinds, both things a person
could do by hand through the app: a task on an account, or an initiative on
a number. Nothing else. No emails, no campaigns, nothing outward-facing —
an agent's reach here is exactly a person's, and a person still has to say
yes.

**What comes back is validated before it is stored.** The prompt gives the
agent account ids, member names, metric keys and cuts, and an answer that
names anything outside that set is dropped at generation — with a log line
— rather than becoming a proposal that fails at the click. The reviewer
sees only actions that will work.

**Costs a real model call.** Generation is an explicit POST.
"""

import json
import logging
import uuid
from datetime import timedelta

from django.utils import timezone

from services.accounts.models import User
from services.customers import forecast
from services.customers.models import Task
from services.customers.scoping import SystemActor, live_customers

from .models import AgentAction, Initiative
from .registry import BY_KEY, compute_all, compute_slices
from .signals import number, signals_for

logger = logging.getLogger(__name__)

# The facilitator and the old prompt speak in `task`/`initiative`; the model
# stores the agent registry's words.
LEGACY_KINDS = {"task": "task.create", "initiative": "initiative.create"}

MAX_PROPOSALS = 5
EXPOSURE_LIMIT = 8
CUT_METRICS = ("at_risk_arr", "nrr", "poor_health_count")


class NothingToProposeFrom(Exception):
    """No customers — there is nothing to act on."""


def _money(value, currency):
    return f"{currency} {value:,.0f}" if value is not None else "unmeasured"


def build_evidence(organisation):
    """Everything the agent is allowed to know."""
    actor = SystemActor(organisation)
    if not live_customers(actor).exists():
        raise NothingToProposeFrom("There are no live customers to act on.")

    currency = organisation.currency
    values = compute_all(organisation)
    signals = signals_for(organisation, values)
    slices = compute_slices(organisation)

    customers = list(forecast.filtered_customers(actor, {}))
    rows = forecast.build_rows(
        customers, organisation, viewer=actor, horizon=forecast.horizon_days({})
    )
    exposure = forecast.exposure_list(rows, limit=EXPOSURE_LIMIT)
    owners = {c.owner_id: c.owner for c in customers if c.owner_id}
    # The account team: who answers for each account in each function
    # (services.knowledge), so a task lands with the person whose job it is.
    from services.knowledge.models import FunctionOwner

    team = {}
    for fo in FunctionOwner.objects.filter(
        customer_id__in=[r["id"] for r in exposure]
    ).select_related("user"):
        team.setdefault(fo.customer_id, {})[fo.get_function_display()] = fo.user.name
    accounts = []
    for row in exposure:
        customer = next(c for c in customers if c.id == row["id"])
        accounts.append(
            {
                "id": row["id"],
                "name": row["name"],
                "owner": row["owner"],
                "owner_id": customer.owner_id,
                "team": team.get(row["id"], {}),
                "arr": row["arr"],
                "downside": row["downside"],
                "days_to_renewal": row["days_to_renewal"],
                "health": row["health_category"],
                "risk": row["risk"],
                "factors": [f["label"] for f in row["factors"]] if row["factors"] else [],
                "product": customer.primary_product.name if customer.primary_product_id else None,
            }
        )

    members = [
        {"id": u.id, "name": u.name}
        for u in User.objects.filter(organisation=organisation, is_active=True).order_by("name")
    ]
    open_initiatives = [
        {
            "id": i.id,
            "title": i.title,
            "metric": i.metric,
            "member_label": i.member_label,
            "target_value": number(i.target_value),
            "target_by": i.target_by.isoformat(),
        }
        for i in Initiative.objects.filter(
            organisation=organisation,
            status__in=[Initiative.Status.PLANNED, Initiative.Status.ACTIVE],
        )
    ]
    cuts = []
    for key in CUT_METRICS:
        for dimension, members_ in slices.get(key, {}).items():
            cuts.append(
                {
                    "metric": key,
                    "dimension": dimension,
                    "members": [
                        {"member": m, "label": label, "value": number(v)}
                        for m, label, v in members_
                    ],
                }
            )
    return {
        "as_of": signals["as_of"],
        "baseline": signals["baseline"],
        "currency": currency,
        "metrics": {k: number(v) for k, v in values.items()},
        "signals": signals["signals"],
        "cuts": cuts,
        "accounts": accounts,
        "members": members,
        "owners": {str(uid): u.name for uid, u in owners.items()},
        "initiatives": open_initiatives,
    }


def build_prompt(evidence):
    currency = evidence["currency"]
    lines = [f"Figures as of {evidence['as_of']}. Currency: {currency}."]
    lines.append("\nHEADLINE METRICS:")
    for metric in BY_KEY.values():
        value = evidence["metrics"].get(metric.key)
        if metric.unit == "money":
            shown = _money(value, currency)
        elif metric.unit == "percent":
            shown = f"{value}%" if value is not None else "unmeasured"
        else:
            shown = str(int(value)) if value is not None else "unmeasured"
        lines.append(f"- {metric.label} [{metric.key}]: {shown}")

    lines.append("\nMATERIAL MOVES SINCE THE MONTH-END:")
    if not evidence["signals"]:
        lines.append("- none recorded yet")
    for s in evidence["signals"]:
        lines.append(
            f"- {s['label']}: {s['value']} from {s['previous']['value']} ({s['change']:+})"
        )

    lines.append("\nCUTS (metric key, cut, member id: label = value):")
    for cut in evidence["cuts"]:
        members = "; ".join(f"{m['member']}: {m['label']} = {m['value']}" for m in cut["members"])
        lines.append(f"- {cut['metric']} by {cut['dimension']}: {members}")

    lines.append("\nACCOUNTS CARRYING THE DOWNSIDE (id: name):")
    if not evidence["accounts"]:
        lines.append("- none: no account carries measurable downside right now")
    for a in evidence["accounts"]:
        if a["days_to_renewal"] is None:
            renewal = "no renewal date"
        elif a["days_to_renewal"] < 0:
            renewal = f"renewal overdue by {-a['days_to_renewal']} days"
        else:
            renewal = f"renews in {a['days_to_renewal']} days"
        factors = ", ".join(a["factors"]) or "no named factors"
        team = "; ".join(f"{fn} {name}" for fn, name in a.get("team", {}).items())
        lines.append(
            f"- {a['id']}: {a['name']} — account owner {a['owner']}"
            + (f" (team: {team})" if team else "")
            + ", "
            f"product {a['product'] or 'unrecorded'}, "
            f"ARR {_money(a['arr'], currency)}, downside {_money(a['downside'], currency)}, "
            f"{renewal}, health {a['health']}, risk {a['risk']:.0%} ({factors})"
        )

    lines.append("\nTEAM MEMBERS (exact names):")
    lines.extend(f"- {m['name']}" for m in evidence["members"])

    lines.append("\nOPEN DECISIONS (id: title):")
    if not evidence["initiatives"]:
        lines.append("- none")
    for i in evidence["initiatives"]:
        lines.append(
            f"- {i['id']}: {i['title']} — {i['metric']} {i['member_label'] or '(whole org)'} "
            f"to {i['target_value']} by {i['target_by']}"
        )
    return "\n".join(lines)


def _parse(raw):
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lstrip().startswith("json"):
            text = text.lstrip()[4:]
    try:
        payload = json.loads(text, strict=False)
    except json.JSONDecodeError as exc:
        # The model was told to answer with the array and nothing else, and
        # mostly does; when it wraps the array in a sentence anyway, the
        # array is still the answer. Seen live from the facilitator.
        start, end = text.find("["), text.rfind("]")
        if start == -1 or end <= start:
            raise ValueError(f"The model's answer wasn't JSON: {exc}") from exc
        try:
            payload = json.loads(text[start : end + 1], strict=False)
        except json.JSONDecodeError as inner:
            raise ValueError(f"The model's answer wasn't JSON: {inner}") from inner
    if isinstance(payload, dict):
        for value in payload.values():
            if isinstance(value, list):
                payload = value
                break
    if not isinstance(payload, list):
        raise ValueError("The model returned JSON, but not an array.")
    return [item for item in payload if isinstance(item, dict)]


def _validate(organisation, evidence, item):
    """One answer → a stored `action`, or None (logged) if it names anything
    outside what the agent was given."""
    kind = LEGACY_KINDS.get(str(item.get("kind") or "").strip().lower())
    action = item.get("action") or {}
    title = str(item.get("title") or "").strip()[:255]
    if not title or kind is None or not isinstance(action, dict):
        logger.warning(
            "proposal dropped: kind=%r title=%r action_is_dict=%s",
            item.get("kind"),
            title,
            isinstance(action, dict),
        )
        return None
    item["kind"] = kind
    today = timezone.localdate()

    if kind == AgentAction.Kind.TASK_CREATE:
        ids = {a["id"] for a in evidence["accounts"]}
        customer_id = action.get("customer_id")
        if customer_id not in ids:
            logger.warning("proposal dropped: customer %r not in the accounts given", customer_id)
            return None
        names = {m["name"] for m in evidence["members"]}
        account = next(a for a in evidence["accounts"] if a["id"] == customer_id)
        assignee = action.get("assignee")
        if assignee not in names:
            assignee = account["owner"] if account["owner"] in names else next(iter(names), "")
        try:
            due_in = max(1, min(60, int(action.get("due_in_days", 14))))
        except (TypeError, ValueError):
            due_in = 14
        priority = (
            action.get("priority") if action.get("priority") in Task.Priority.values else "medium"
        )
        return {
            "customer_id": customer_id,
            "customer_name": account["name"],
            "title": str(action.get("title") or title)[:255],
            "assignee_name": assignee,
            "due_date": (today + timedelta(days=due_in)).isoformat(),
            "priority": priority,
        }

    metric = BY_KEY.get(action.get("metric"))
    if metric is None:
        logger.warning("proposal dropped: unknown metric %r", action.get("metric"))
        return None
    dimension = action.get("dimension") or ""
    member = str(action.get("member") or "")
    member_label = ""
    if dimension:
        cut = next(
            (
                c
                for c in evidence["cuts"]
                if c["metric"] == metric.key and c["dimension"] == dimension
            ),
            None,
        )
        if cut is None or dimension not in metric.slices:
            logger.warning("proposal dropped: %s has no cut %r", metric.key, dimension)
            return None
        found = next((m for m in cut["members"] if m["member"] == member), None)
        if found is None:
            logger.warning(
                "proposal dropped: member %r not in %s by %s", member, metric.key, dimension
            )
            return None
        member_label = found["label"]
    try:
        target_value = float(action.get("target_value"))
        target_in = max(14, min(180, int(action.get("target_in_days", 90))))
    except (TypeError, ValueError):
        logger.warning("proposal dropped: unreadable target on %s", metric.key)
        return None
    return {
        "metric": metric.key,
        "metric_label": metric.label,
        "dimension": dimension,
        "member": member if dimension else "",
        "member_label": member_label,
        "target_value": target_value,
        "target_by": (today + timedelta(days=target_in)).isoformat(),
    }


def store_answer(organisation, evidence, raw, *, limit, generated_by=None, session=None):
    """Parse one answer, validate each item against what the prompt offered,
    and store the survivors as one batch of Ops agent actions. Used by the
    facilitator, which asks a different question of the same evidence; an
    item colliding with an action already open is skipped (Decision 15)."""
    from django.db import IntegrityError, transaction

    batch = uuid.uuid4().hex
    open_ids = {i["id"] for i in evidence["initiatives"]}
    stored = []
    for item in _parse(raw)[:limit]:
        action = _validate(organisation, evidence, item)
        if action is None:
            continue
        linked = item.get("initiative_id")
        fields = {
            "organisation": organisation,
            "agent": AgentAction.Agent.OPS,
            "batch": batch,
            "kind": item["kind"],
            "title": str(item["title"]).strip()[:255],
            "rationale": str(item.get("rationale") or "").strip(),
            "evidence": [str(e) for e in (item.get("evidence") or []) if isinstance(e, str)][:4],
            "initiative_id": linked if linked in open_ids else None,
            "generated_by": generated_by,
            "session": session,
        }
        if item["kind"] == AgentAction.Kind.TASK_CREATE:
            fields["customer_id"] = action["customer_id"]
            fields["target"] = f"task:{action['title'].casefold()}"[:160]
            fields["payload"] = {
                "title": action["title"],
                "assignee_id": None,
                "assignee_name": action["assignee_name"],
                "due_date": action["due_date"],
                "priority": action["priority"],
            }
        else:
            fields["target"] = (
                f"initiative:{action['metric']}:{action['dimension']}:{action['member']}"
            )[:160]
            fields["payload"] = action
        try:
            with transaction.atomic():
                stored.append(AgentAction.objects.create(**fields))
        except IntegrityError:
            logger.info("item skipped: an action like it is already open")
    return stored


def match_member(organisation, name):
    """The one active member of `organisation` called `name`: an exact match
    first, then one ignoring case. None when there is no single one."""
    name = (name or "").strip()
    if not name:
        return None
    members = User.objects.filter(organisation=organisation, is_active=True)
    exact = list(members.filter(name=name)[:2])
    if exact:
        return exact[0] if len(exact) == 1 else None
    loose = list(members.filter(name__iexact=name)[:2])
    return loose[0] if len(loose) == 1 else None
