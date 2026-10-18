"""What the Brain's routes return, and the rules every read of stored model
prose follows."""

from services.customers.scoping import sees_everything, visible_customers

#: How many stored rows a read looks through for one the reader may see.
READ_DEPTH = 20


def iso(value):
    return value.isoformat() if value else None


def first_readable(rows, reader, ids_of):
    """The first of `rows` (newest first) that `reader` may be shown.
    `ids_of(row)` is the customer ids the row's prompt named, or None for a
    row written before they were recorded — shown only to someone who sees
    every customer. A row naming customers is shown only if the reader may
    open every one of them **and** the downside it quotes for them was
    counted with no more than the reader's rights: the reader wrote it, or
    the reader sees everything. Two readers who can open the same customer
    may read different risks on it (departments, accounts), so one's prose
    is not the other's."""
    # SOC2:AUTH-02 model prose naming customers is as private as the customers it names
    named = [ids_of(row) for row in rows]
    wanted = {i for ids in named if ids for i in ids}
    openable = set()
    if wanted:
        openable = set(visible_customers(reader).filter(id__in=wanted).values_list("id", flat=True))
    everything = None
    for row, ids in zip(rows, named):
        if not ids and ids is not None:
            return row
        if everything is None:
            everything = sees_everything(reader)
        if ids is None:
            if everything:
                return row
        elif set(ids) <= openable and (everything or row.generated_by_id == reader.id):
            return row
    return None


def is_stale(row, current_digest, since):
    """The figures moved since the row was written, or a newer comparison
    point exists than the one it was written against."""
    if row.figures_digest != current_digest:
        return True
    return since is not None and (row.baseline is None or since > row.baseline)


def brief_payload(row, scope, *, stale):
    return {
        "id": row.id,
        "scope": scope.key,
        "as_of": iso(row.as_of),
        "baseline": iso(row.baseline),
        "headline": row.headline,
        "body": row.body,
        "watch": row.watch,
        "generated_at": row.generated_at.isoformat(),
        "generated_by": row.generated_by.name if row.generated_by else None,
        "stale": stale,
    }


def explanation_payload(row, scope, *, stale):
    return {
        "id": row.id,
        "metric": row.metric,
        "scope": scope.key,
        "as_of": iso(row.as_of),
        "text": row.text,
        "evidence": row.evidence,
        "hidden": row.inputs.get("hidden", 0),
        "generated_at": row.generated_at.isoformat(),
        "generated_by": row.generated_by.name if row.generated_by else None,
        "stale": stale,
    }
