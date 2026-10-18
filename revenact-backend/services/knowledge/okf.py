"""A workspace's knowledge as an Open Knowledge Format bundle (OKF v0.2).

OKF (github.com/GoogleCloudPlatform/open-knowledge-format) is markdown with
YAML frontmatter in a directory tree: readable by people, loadable by an
agent, diffable in git, and served by anything that reads files. This
writes one bundle per workspace from what Revenact already holds:

- `metrics/<key>.md` (type Metric): every headline number in the metric
  layer (services/metrics/registry.py) with its definition, unit, which way
  is good, its cuts, and its current value.
- `computations/<key>.md` (type Attested Computation): the sanctioned way to
  compute that metric (runtime `python`, the registry call), the executor and
  attester that confirm a figure, `verified` by the month-end snapshot
  process at the latest MetricSnapshot, and `stale_after` the month end after
  it (OKF §10).
- `customers/<slug>.md` (type Customer): each live customer's profile and
  who answers for it in each function.
- `knowledge/<customer>/…` (types Knowledge Note, Answered Question): what
  people know about each customer (services.knowledge Contribution and
  answered Question), `generated` by the human who wrote it, with the
  customer as its source.
- `references/`: how to run and check a computation; `index.md` at every
  level (progressive disclosure, OKF §8) and a root `log.md` (§9).

Only someone who may see the whole workspace may export it
(scoping.sees_everything), and contributions still pass their own
visibility rule. People appear as `human:<name>-<id>`, never by email.
"""

import io
import posixpath
import re
import zipfile
from datetime import date, timedelta
from datetime import timezone as dt_timezone

import yaml
from django.conf import settings
from django.utils import timezone

from services.customers.scoping import visible_customers
from services.metrics import registry
from services.metrics.models import MetricSnapshot

from .models import Contribution, FunctionOwner, Question

OKF_VERSION = "0.2"
PRODUCER = "revenact-okf/1"
EXPORT_PROCESS = "process:revenact-okf-export"
SNAPSHOT_PROCESS = "process:revenact-month-end"

#: Where each registry source's rollup lives (the computation's own sources).
SOURCE_MODULES = {
    "portfolio": "services/customers/portfolio.py",
    "forecast": "services/customers/forecast.py",
    "health": "services/customers/portfolio.py",
    "support": "services/customers/models.py#Ticket",
    "usage": "services/customers/usage.py",
    "knowledge": "services/knowledge/models.py",
}
UNIT_LABELS = {registry.MONEY: "money", registry.PERCENT: "percent", registry.COUNT: "count"}
BETTER_LABELS = {
    registry.UP: "Higher is better.",
    registry.DOWN: "Lower is better.",
    registry.NONE: "Context, not a target: neither direction is good on its own.",
}


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-") or "item"


def actor(user) -> str:
    """OKF §7: a person is `human:<id>`; a stable, readable id, never an email."""
    return f"human:{slug(user.name or 'user')}-{user.pk}"


def iso(moment) -> str:
    if isinstance(moment, date) and not hasattr(moment, "hour"):
        return f"{moment.isoformat()}T00:00:00Z"
    return timezone.localtime(moment, dt_timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def month_end_after(day: date) -> date:
    first_of_next = (day.replace(day=1) + timedelta(days=32)).replace(day=1)
    return (first_of_next + timedelta(days=32)).replace(day=1) - timedelta(days=1)


def concept(frontmatter: dict, body: str) -> str:
    front = yaml.safe_dump(frontmatter, sort_keys=False, allow_unicode=True, width=1000).strip()
    return f"---\n{front}\n---\n\n{body.strip()}\n"


def index(sections: list[tuple[str, list[tuple[str, str, str]]]], front: dict | None = None) -> str:
    """OKF §8: headed lists of `[title](url) - description`."""
    parts = []
    if front:
        parts.append(f"---\n{yaml.safe_dump(front, sort_keys=False).strip()}\n---\n")
    for heading, entries in sections:
        parts.append(f"# {heading}\n")
        parts += [f"* [{title}]({url}) - {desc}" for title, url, desc in entries] or ["* (none)"]
        parts.append("")
    return "\n".join(parts).strip() + "\n"


def _first_sentence(text: str) -> str:
    match = re.match(r"(.+?[.!?])(\s|$)", text.strip())
    return match.group(1) if match else text.strip()


def _value_line(metric, value, currency) -> str:
    if value is None:
        return "Unmeasured (not zero): the rollup has nothing to measure yet."
    if metric.unit == registry.MONEY:
        return f"{currency} {value:,.0f}"
    if metric.unit == registry.PERCENT:
        return f"{value:.1f}%"
    return f"{value:,}" if isinstance(value, int) else str(value)


class Bundle:
    """`values=False` leaves metric values out (definitions and computations
    only): Copilot's copy, since a figure's reach depends on the asker's scope
    and the Brain already shares figures under its own rule. `sources_by_path`
    names, for each concept and index, the records it shows, as Copilot
    citation sources, so a shared conversation's other readers are checked
    against them (copilot.views, SOC2:AUTH-02)."""

    def __init__(self, organisation, user, now=None, values=True):
        self.organisation = organisation
        self.user = user
        self.now = now or timezone.now()
        self.values = values
        self.files: dict[str, str] = {}
        self.sources_by_path: dict[str, list[dict]] = {}

    def build(self) -> dict[str, str]:
        metrics = self._metrics()
        customers = self._customers()
        self._references()
        self.files["index.md"] = index(
            [
                ("Metrics", metrics),
                ("Customers", customers),
                (
                    "Directories",
                    [
                        ("Metrics", "metrics/", "Every headline number and its definition."),
                        (
                            "Computations",
                            "computations/",
                            "The sanctioned, attestable computation behind each metric.",
                        ),
                        ("Customers", "customers/", "Customer profiles and who answers for them."),
                        ("Knowledge", "knowledge/", "What people know about each customer."),
                        ("References", "references/", "How to run and check a computation."),
                    ],
                ),
            ],
            front={"okf_version": OKF_VERSION},
        )
        self.files["log.md"] = (
            "# Bundle Update Log\n\n"
            f"## {self.now.date().isoformat()}\n"
            f"* **Creation**: Exported from Revenact for {self.organisation.name} "
            f"({len(metrics)} metrics, {len(customers)} customers).\n"
        )
        return {path: _relative_links(path, text) for path, text in self.files.items()}

    # --- metrics and their attested computations ------------------------------

    def _metrics(self):
        values = registry.compute_all(self.organisation) if self.values else {}
        latest = {}
        for row in MetricSnapshot.objects.filter(
            organisation=self.organisation, dimension=""
        ).order_by("metric", "-period_end"):
            latest.setdefault(row.metric, row)
        currency = getattr(self.organisation, "currency", "") or "USD"
        listed, computations = [], []
        for metric in registry.METRICS:
            value = values.get(metric.key)
            snapshot = latest.get(metric.key)
            description = _first_sentence(metric.note)
            cuts = [registry.DIMENSION_LABELS[d] for d in metric.slices]
            current = (
                f"# Current value\n\n{_value_line(metric, value, currency)}, as of "
                f"{self.now.date().isoformat()},\nover the whole organisation's book.\n\n"
                if self.values
                else ""
            )
            cut_lines = (
                "\n".join(f"- {cut}" for cut in cuts)
                if cuts
                else "No cuts: the rollup does not split this figure."
            )
            self.files[f"metrics/{metric.key}.md"] = concept(
                {
                    "type": "Metric",
                    "title": metric.label,
                    "description": description,
                    "tags": [UNIT_LABELS[metric.unit], f"source:{metric.source}"],
                    "status": "stable",
                    "generated": {"by": EXPORT_PROCESS, "at": iso(self.now)},
                    "unit": UNIT_LABELS[metric.unit],
                    "better": metric.better,
                    **(
                        {"value": {"as_of": iso(self.now), "value": _json_number(value)}}
                        if self.values
                        else {}
                    ),
                },
                f"""
# Definition

{metric.note}

{BETTER_LABELS[metric.better]} Computed by
[the {metric.label} computation](/computations/{metric.key}.md).

{current}# Cuts

{cut_lines}
""",
            )
            front = {
                "type": "Attested Computation",
                "title": f"{metric.label} computation",
                "description": f"The sanctioned way Revenact computes {metric.label}.",
                "tags": [f"source:{metric.source}"],
                "status": "stable",
                "runtime": "python",
                "parameters": [{"name": "organisation", "type": "integer", "required": True}],
                "executor": {
                    "resource": "/references/executors/revenact-metrics.md",
                    "receipt": ["metric", "period_end", "value", "captured_at"],
                },
                "attester": {"resource": "/references/attesters/month-end-snapshot.md"},
                "generated": {"by": EXPORT_PROCESS, "at": iso(self.now)},
                "sources": [
                    {
                        "id": "registry",
                        "resource": f"revenact:services/metrics/registry.py#{metric.key}",
                        "title": "Revenact metric registry",
                    },
                    {
                        "id": "rollup",
                        "resource": f"revenact:{SOURCE_MODULES.get(metric.source, metric.source)}",
                        "title": f"The {metric.source} rollup the dashboards draw",
                    },
                ],
            }
            if snapshot is not None:
                front["verified"] = {"by": SNAPSHOT_PROCESS, "at": iso(snapshot.captured_at)}
                front["stale_after"] = iso(month_end_after(snapshot.period_end) + timedelta(days=1))
            self.files[f"computations/{metric.key}.md"] = concept(
                front,
                f"""
# Computation

    from services.metrics.registry import METRICS, compute_value
    metric = next(m for m in METRICS if m.key == "{metric.key}")
    value = compute_value(organisation, metric)

The figure is read from the same rollup the dashboards draw, so the number
here is the number on the screen, never a second computation that can drift.[^registry][^rollup]
A rollup that reports nothing is unmeasured, not zero.

Used by [{metric.label}](/metrics/{metric.key}.md).

[^registry]: Revenact metric registry
[^rollup]: The {metric.source} rollup the dashboards draw
""",
            )
            listed.append((metric.label, f"metrics/{metric.key}.md", description))
            computations.append(
                (f"{metric.label} computation", f"{metric.key}.md", f"Computes {metric.label}.")
            )
        self.files["metrics/index.md"] = index(
            [("Metrics", [(t, u.split("/", 1)[1], d) for t, u, d in listed])]
        )
        self.files["computations/index.md"] = index([("Attested computations", computations)])
        return listed

    # --- customers and what people know about them ----------------------------

    def _customers(self):
        from services.knowledge.views import visible_contributions

        customers = (
            visible_customers(self.user)
            .filter(organisation=self.organisation, is_archived=False)
            .select_related("owner")
            .order_by("name")
        )
        owners = {}
        for fo in FunctionOwner.objects.filter(customer__in=customers).select_related("user"):
            owners.setdefault(fo.customer_id, []).append(fo)
        notes = {}
        contributions = visible_contributions(
            self.user, Contribution.objects.filter(organisation=self.organisation)
        ).select_related("author", "customer")
        for note in contributions:
            notes.setdefault(note.customer_id, []).append(note)
        answers = {
            q.answer_id: q
            for q in Question.objects.filter(
                organisation=self.organisation, status=Question.Status.ANSWERED
            ).select_related("asked_by")
        }

        frontend = getattr(settings, "FRONTEND_URL", "").rstrip("/")
        listed = []
        knowledge_index = []
        all_profiles = []
        for customer in customers:
            customer_slug = f"{slug(customer.name)}-{customer.pk}"
            path = f"customers/{customer_slug}.md"
            note_links = []
            company = {
                "company": customer.name,
                "company_type": "customer",
                "company_id": customer.pk,
            }
            profile_source = {
                "type": "customer",
                "id": customer.pk,
                "label": customer.name,
                "date": self.now.date().isoformat(),
                **company,
            }
            all_profiles.append(profile_source)
            note_sources = []
            for note in notes.get(customer.pk, []):
                question = answers.get(note.pk)
                kind = "question" if question else "note"
                note_path = f"knowledge/{customer_slug}/{kind}-{note.pk}.md"
                title = (
                    f"Answer: {question.text[:70]}"
                    if question
                    else f"{note.get_function_display()} on {customer.name}"
                )
                front = {
                    "type": "Answered Question" if question else "Knowledge Note",
                    "title": title,
                    "description": _first_sentence(note.body)[:200],
                    "tags": [note.function, slug(customer.name)],
                    "status": "stable",
                    "generated": {"by": actor(note.author), "at": iso(note.updated_at)},
                    "sources": [{"id": "customer", "resource": f"/{path}", "title": customer.name}],
                }
                body = ""
                if question:
                    front["question"] = question.text
                    front["asked_by"] = actor(question.asked_by)
                    body += f"# Question\n\n{question.text}\n\n# Answer\n\n"
                body += f"{note.body}[^customer]\n\nAbout [{customer.name}](/{path}).\n\n"
                body += f"[^customer]: {customer.name}"
                self.files[note_path] = concept(front, body)
                note_source = {
                    "type": "contribution",
                    "id": note.pk,
                    "label": title,
                    "date": note.created_at.date().isoformat(),
                    **company,
                }
                note_sources.append(note_source)
                self.sources_by_path[note_path] = [note_source]
                note_links.append((title, f"/{note_path}", front["description"]))
            if note_links:
                self.sources_by_path[f"knowledge/{customer_slug}/index.md"] = [
                    profile_source,
                    *note_sources,
                ]
                self.files[f"knowledge/{customer_slug}/index.md"] = index(
                    [(customer.name, [(t, u.rsplit("/", 1)[1], d) for t, u, d in note_links])]
                )
                knowledge_index.append(
                    (customer.name, f"{customer_slug}/", f"{len(note_links)} note(s).")
                )

            responsible = [
                f"- {fo.get_function_display()}: {fo.user.name}"
                for fo in owners.get(customer.pk, [])
            ]
            if customer.owner_id:
                responsible.insert(0, f"- Customer Success (owner): {customer.owner.name}")
            description = (
                f"{customer.get_lifecycle_stage_display()} customer, "
                f"health {customer.health_category}."
            )
            front = {
                "type": "Customer",
                "title": customer.name,
                "description": description,
                "tags": [customer.lifecycle_stage, f"health:{customer.health_category}"],
                "status": "stable",
                "generated": {"by": EXPORT_PROCESS, "at": iso(self.now)},
            }
            if frontend:
                front["resource"] = f"{frontend}/organizations/{customer.pk}"
            if customer.renewal_date:
                front["stale_after"] = iso(customer.renewal_date)
            profile = [
                ("Lifecycle", customer.get_lifecycle_stage_display()),
                ("Health", f"{customer.health_score} ({customer.health_category})"),
                ("ARR", f"{customer.currency} {customer.arr_billed_at_hq:,.0f}"),
                ("Renewal", customer.renewal_date.isoformat() if customer.renewal_date else "-"),
            ]
            self.files[path] = concept(
                front,
                "# Profile\n\n| Field | Value |\n|---|---|\n"
                + "\n".join(f"| {k} | {v} |" for k, v in profile)
                + "\n\n# Who answers for it\n\n"
                + ("\n".join(responsible) or "Nobody is named yet.")
                + "\n\n# What the company knows\n\n"
                + ("\n".join(f"- [{t}]({u}) - {d}" for t, u, d in note_links) or "No notes yet."),
            )
            self.sources_by_path[path] = [profile_source, *note_sources]
            listed.append((customer.name, path, description))
        # An index that lists customers shows their names and health: it
        # counts as quoting every one of them.
        for listing in ("index.md", "customers/index.md", "knowledge/index.md"):
            self.sources_by_path[listing] = list(all_profiles)
        self.files["customers/index.md"] = index(
            [("Customers", [(t, u.split("/", 1)[1], d) for t, u, d in listed])]
        )
        self.files["knowledge/index.md"] = index([("By customer", knowledge_index)])
        return listed

    # --- references ------------------------------------------------------------

    def _references(self):
        stamp = {"by": EXPORT_PROCESS, "at": iso(self.now)}
        self.files["references/executors/revenact-metrics.md"] = concept(
            {
                "type": "Reference",
                "title": "Running a Revenact metric computation",
                "description": "How a consumer obtains a metric's value and its receipt.",
                "generated": stamp,
            },
            """
# Run

Ask Revenact for the metric: `GET /api/v1/metrics/` (the current figures) or
`GET /api/v1/metrics/<key>/history/` (each month-end figure), authenticated as
someone who may see the whole organisation.

# Receipt

`metric`, `period_end`, `value` and `captured_at` from the month-end row the
figure was read from.
""",
        )
        self.files["references/attesters/month-end-snapshot.md"] = concept(
            {
                "type": "Reference",
                "title": "Month-end snapshot attester",
                "description": "Deterministic check that a figure is the recorded month-end value.",
                "generated": stamp,
            },
            """
# Check

Given a receipt, re-read the month-end row for (`metric`, `period_end`) from
`GET /api/v1/metrics/<key>/history/` and compare `value` exactly. A figure
that does not match the recorded row fails; no model is involved.
""",
        )
        self.files["references/index.md"] = index(
            [
                (
                    "References",
                    [
                        (
                            "Running a metric computation",
                            "executors/revenact-metrics.md",
                            "How to obtain a value and its receipt.",
                        ),
                        (
                            "Month-end snapshot attester",
                            "attesters/month-end-snapshot.md",
                            "The deterministic check on a figure.",
                        ),
                    ],
                )
            ]
        )


_BUNDLE_LINK = re.compile(r"\]\(/([^)\s]+)\)")


def _relative_links(path: str, text: str) -> str:
    """Body links as relative paths (OKF §6.1 allows both forms). The spec
    recommends bundle-absolute `/…` links, but Google's reference viewer
    (open-knowledge-format, viewer/generator.py) skips them, so relative
    links are what every consumer follows. Frontmatter is left alone."""

    if text.startswith("---\n"):
        _, front, body = text.split("---\n", 2)
        head = f"---\n{front}---\n"
    else:
        head, body = "", text
    here = posixpath.dirname(path) or "."
    body = _BUNDLE_LINK.sub(lambda m: f"]({posixpath.relpath(m.group(1), here)})", body)
    return head + body


def _json_number(value):
    if value is None:
        return None
    try:
        return float(value) if not isinstance(value, int) else value
    except (TypeError, ValueError):
        return str(value)


def build_bundle(organisation, user, now=None) -> dict[str, str]:
    """`{bundle-relative path: file text}`."""
    return Bundle(organisation, user, now).build()


def bundle_zip(organisation, user, now=None) -> tuple[str, bytes]:
    """(filename, zip bytes): the bundle under one top-level directory."""
    files = build_bundle(organisation, user, now)
    root = f"revenact-{slug(organisation.name)}-okf"
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for path, text in sorted(files.items()):
            archive.writestr(f"{root}/{path}", text)
    return f"{root}.zip", buffer.getvalue()


def conformance_errors(files: dict[str, str]) -> list[str]:
    """OKF §11: every non-reserved .md has parseable frontmatter with a
    non-empty `type`; an index.md carries frontmatter only at the root, and
    then only `okf_version`."""
    errors = []
    for path, text in files.items():
        name = path.rsplit("/", 1)[-1]
        has_front = text.startswith("---\n")
        if name in ("index.md", "log.md"):
            if has_front and not (path == "index.md" and name == "index.md"):
                errors.append(f"{path}: reserved file with frontmatter")
            if path == "index.md" and has_front:
                front = yaml.safe_load(text.split("---\n", 2)[1])
                if set(front) != {"okf_version"}:
                    errors.append(f"{path}: root index frontmatter beyond okf_version")
            continue
        if not has_front:
            errors.append(f"{path}: no frontmatter")
            continue
        try:
            front = yaml.safe_load(text.split("---\n", 2)[1])
        except yaml.YAMLError as exc:
            errors.append(f"{path}: frontmatter does not parse ({type(exc).__name__})")
            continue
        if not isinstance(front, dict) or not str(front.get("type") or "").strip():
            errors.append(f"{path}: no type")
    return errors
