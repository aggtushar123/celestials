"""Why is this number where it is?

A signal says a metric moved and names the members that moved it most. A
metric tile says the number and its move. Neither says *why* in words a
manager can repeat in a meeting. This asks the model for exactly that —
two to four sentences on one metric, written from the metric's own
definition, its value now and at the last month-end, every cut the
registry has for it (with each member's own move), the accounts carrying
the downside, and any open decision on that number. Nothing else: no
records, no transcripts. Every sentence is checkable against the figures
the prompt carried, which are stored beside the text.

**Stored, not recomputed on view.** An explanation costs a real model
call; the latest one per metric is kept with the figures it described, so
reading is free and a stale explanation says plainly which day it explains.

**Costs a real model call**, logged under the `explain` purpose.
"""

import json
from datetime import date

from django.utils import timezone

from services.copilot.anthropic_client import get_completion
from services.customers import forecast
from services.customers.scoping import SystemActor, live_customers

from .initiatives import as_decimal
from .models import COMPANY_SCOPE, Explanation, Initiative
from .registry import BY_KEY, DIMENSION_LABELS, as_of, compute_all, compute_slices
from .signals import explanation_digest, latest_by_member, latest_whole_org, number

OUTPUT_TOKENS = 600
EXPOSURE_LIMIT = 6


class UnknownMetric(Exception):
    """Not a key in the registry."""


class NothingToExplain(Exception):
    """No live customers — the number is not about anything yet."""


SYSTEM_PROMPT = """You explain one business metric to the management team of \
a customer-success organisation.

You will be given the metric's definition, its value today and at the last \
month-end, every cut of it the platform has (with each member's own value \
and move), the accounts carrying the most revenue at risk, and any open \
decision on this number.

Answer with a JSON object and nothing else — your reply starts with "{" and \
ends with "}":
  "text": 2 to 4 plain sentences saying why the number is where it is and, \
if there is a month-end to compare against, what moved it. Name the members \
and accounts that account for most of it, with their figures. If the cuts \
are spread evenly, say so rather than inventing a driver.
  "evidence": 2 to 4 short strings, each one figure from the input quoted as \
given.

Rules:
- Every number and name must come from the input. Never invent a figure, an \
account or a cause the figures do not show.
- If there is no month-end yet, explain the level, not a move.
- Say "unmeasured" for anything the input marks unmeasured; do not guess.
- No advice, no next steps — that is someone else's job. Only why.
"""


def _money(value, currency):
    return f"{currency} {value:,.0f}" if value is not None else "unmeasured"


def _shown(metric, value, currency):
    if value is None:
        return "unmeasured"
    if metric.unit == "money":
        return _money(value, currency)
    if metric.unit == "percent":
        return f"{value}%"
    return str(int(round(value)))


def account_line(row):
    """One `forecast.exposure_list` row as the prompt's account entry."""
    return {
        "name": row["name"],
        "owner": row["owner"],
        "arr": row["arr"],
        "downside": row["downside"],
        "days_to_renewal": row["days_to_renewal"],
        "health": row["health_category"],
        "factors": [f["label"] for f in row["factors"]] if row["factors"] else [],
    }


def evidence_from(
    organisation,
    key,
    *,
    value,
    previous_value,
    baseline,
    cuts,
    previous_cuts,
    accounts,
    hidden=0,
    customer_ids=(),
    initiatives=(),
):
    """What the prompt may carry about `key`, for any part of the book.
    `cuts` is this metric's `{dimension: [(member, label, value)]}` and
    `previous_cuts` `{dimension: {member: value}}`; `accounts` are
    `account_line`s of customers the reader may open, `hidden` how many more
    carry downside, `customer_ids` the ids of the named ones."""
    metric = BY_KEY[key]
    return {
        "as_of": as_of().isoformat(),
        "baseline": baseline.isoformat() if baseline else None,
        "currency": organisation.currency,
        "metric": {
            "key": metric.key,
            "label": metric.label,
            "unit": metric.unit,
            "better": metric.better,
            "note": metric.note,
        },
        "value": number(value),
        "previous_value": number(previous_value),
        "cuts": [
            {
                "dimension": dimension,
                "dimension_label": DIMENSION_LABELS[dimension],
                "members": [
                    {
                        "member": m,
                        "label": label,
                        "value": number(v),
                        "previous": (previous_cuts.get(dimension) or {}).get(m),
                    }
                    for m, label, v in members
                ],
            }
            for dimension, members in cuts.items()
        ],
        "accounts": list(accounts),
        "hidden": hidden,
        "customer_ids": list(customer_ids),
        "initiatives": list(initiatives),
    }


def build_evidence(organisation, key):
    metric = BY_KEY.get(key)
    if metric is None:
        raise UnknownMetric(f"No metric called {key!r}.")
    actor = SystemActor(organisation)
    if not live_customers(actor).exists():
        raise NothingToExplain("There are no live customers, so there is nothing to explain.")

    values = compute_all(organisation)
    previous = latest_whole_org(organisation).get(key)
    cuts = compute_slices(organisation)[key] if metric.slices else {}
    previous_cuts = {
        dimension: {
            member: number(row.value)
            for member, row in latest_by_member(organisation, key, dimension).items()
        }
        for dimension in cuts
    }

    customers = list(forecast.filtered_customers(actor, {}))
    rows = forecast.build_rows(
        customers, organisation, viewer=actor, horizon=forecast.horizon_days({})
    )
    exposed = forecast.exposure_list(rows, limit=EXPOSURE_LIMIT)
    initiatives = [
        {
            "title": i.title,
            "member_label": i.member_label,
            "target_value": number(i.target_value),
            "target_by": i.target_by.isoformat(),
        }
        for i in Initiative.objects.filter(
            organisation=organisation,
            metric=key,
            status__in=[Initiative.Status.PLANNED, Initiative.Status.ACTIVE],
        )
    ]
    return evidence_from(
        organisation,
        key,
        value=values[key],
        previous_value=number(previous.value) if previous else None,
        baseline=previous.period_end if previous else None,
        cuts=cuts,
        previous_cuts=previous_cuts,
        accounts=[account_line(row) for row in exposed],
        customer_ids=[row["id"] for row in exposed],
        initiatives=initiatives,
    )


def build_prompt(evidence):
    metric = BY_KEY[evidence["metric"]["key"]]
    currency = evidence["currency"]
    m = evidence["metric"]
    better = {"up": "higher is better", "down": "lower is better", "none": "no direction is better"}
    lines = [
        f"METRIC: {m['label']} [{m['key']}] — {m['note']} ({better[m['better']]})",
        f"Today ({evidence['as_of']}): {_shown(metric, evidence['value'], currency)}",
    ]
    if evidence["baseline"]:
        prev = evidence["previous_value"]
        lines.append(f"At the {evidence['baseline']} month-end: {_shown(metric, prev, currency)}")
        if prev is not None and evidence["value"] is not None:
            change = round(evidence["value"] - prev, 4)
            lines.append(f"Move: {'+' if change >= 0 else ''}{_shown(metric, change, currency)}")
    else:
        lines.append("No month-end recorded yet — explain the level, not a move.")

    for cut in evidence["cuts"]:
        lines.append(f"\nBY {cut['dimension_label'].upper()}:")
        for member in cut["members"]:
            now = _shown(metric, member["value"], currency)
            if evidence["baseline"]:
                was = _shown(metric, member["previous"], currency)
                lines.append(f"- {member['label']}: {now} (was {was})")
            else:
                lines.append(f"- {member['label']}: {now}")

    lines.append("\nACCOUNTS CARRYING THE DOWNSIDE:")
    hidden = evidence.get("hidden", 0)
    if not evidence["accounts"] and not hidden:
        lines.append("- none: no account carries measurable downside right now")
    for a in evidence["accounts"]:
        if a["days_to_renewal"] is None:
            renewal = "no renewal date"
        elif a["days_to_renewal"] < 0:
            renewal = f"renewal overdue by {-a['days_to_renewal']} days"
        else:
            renewal = f"renews in {a['days_to_renewal']} days"
        factors = ", ".join(a["factors"]) or "no named factors"
        lines.append(
            f"- {a['name']} (owner {a['owner']}): ARR {_money(a['arr'], currency)}, "
            f"downside {_money(a['downside'], currency)}, {renewal}, health {a['health']} "
            f"({factors})"
        )
    if hidden:
        lines.append(f"- {hidden} more that this reader cannot open; not named here")

    if evidence["initiatives"]:
        lines.append("\nOPEN DECISIONS ON THIS NUMBER:")
        for i in evidence["initiatives"]:
            lines.append(
                f"- {i['title']} — {i['member_label'] or 'whole organisation'} "
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
        # Prose around the object, or the object wrapped in a second pair of
        # braces (seen live: the first prompt said the reply "starts with
        # {{" and the model took it literally). Take the outermost object
        # and peel one doubled brace.
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise ValueError(f"The model's answer wasn't JSON: {exc}") from exc
        inner_text = text[start : end + 1]
        if inner_text.startswith("{{") and inner_text.endswith("}}"):
            inner_text = inner_text[1:-1]
        try:
            payload = json.loads(inner_text, strict=False)
        except json.JSONDecodeError as inner:
            raise ValueError(f"The model's answer wasn't JSON: {inner}") from inner
    if not isinstance(payload, dict) or not str(payload.get("text") or "").strip():
        raise ValueError("The model returned JSON, but not an explanation.")
    evidence = [str(e) for e in (payload.get("evidence") or []) if isinstance(e, str)]
    return str(payload["text"]).strip(), evidence[:4]


def explain(
    organisation,
    key,
    *,
    generated_by=None,
    evidence=None,
    scope_key=COMPANY_SCOPE,
    figures_digest=None,
):
    """One model call → the stored explanation of `key` as it stands today.

    With no `evidence`, the whole organisation's (`build_evidence`); a Brain
    scope passes its own and its `scope_key`. Lets CopilotNotConfigured /
    CopilotRequestFailed / BudgetExceeded through for the view; raises
    UnknownMetric, NothingToExplain, or ValueError on an unreadable answer.
    """
    evidence = evidence if evidence is not None else build_evidence(organisation, key)
    raw = get_completion(
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_prompt(evidence)}],
        max_tokens=OUTPUT_TOKENS,
        purpose="explain",
        organisation=organisation,
        user=generated_by,
        scope_key=scope_key,
    )
    text, cited = _parse(raw)
    if figures_digest is None:
        cuts = {
            c["dimension"]: [(m["member"], m["label"], m["value"]) for m in c["members"]]
            for c in evidence["cuts"]
        }
        figures_digest = explanation_digest(evidence["value"], cuts)
    return Explanation.objects.create(
        organisation=organisation,
        metric=key,
        as_of=date.fromisoformat(evidence["as_of"]),
        baseline=date.fromisoformat(evidence["baseline"]) if evidence["baseline"] else None,
        value=as_decimal(evidence["value"]),
        previous_value=as_decimal(evidence["previous_value"]),
        text=text,
        evidence=cited,
        inputs=evidence,
        generated_by=generated_by,
        generated_at=timezone.now(),
        scope_key=scope_key,
        figures_digest=figures_digest,
    )
