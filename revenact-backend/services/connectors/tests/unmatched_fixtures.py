"""Round 2 D3 test helpers: a remote item from someone no customer knows,
and a stored waiting row."""

from django.utils import timezone

from services.connectors.models import UnmatchedItem
from services.connectors.providers.base import RemoteTicket

_n = iter(range(1, 100_000))


def remote(**fields):
    n = next(_n)
    values = {
        "external_id": f"SUP-{n}",
        "number": f"SUP-{n}",
        "title": "Export fails",
        "description": "Nobody can export since this morning.",
        "requester_email": "ann@newco.io",
        "requester_name": "Ann Lee",
        "url": f"https://acme.atlassian.net/browse/SUP-{n}",
        "opened_at": timezone.localdate(),
        "extra": {"updated_at": timezone.now().isoformat()},
    }
    values.update(fields)
    return RemoteTicket(**values)


def item(connector, **fields):
    n = next(_n)
    now = timezone.now()
    values = {
        "organisation": connector.organisation,
        "connector": connector,
        "provider": connector.provider,
        "department": connector.department,
        "external_id": f"X-{n}",
        "number": f"X-{n}",
        "title": "Export fails",
        "excerpt": "Nobody can export.",
        "requester_name": "Ann Lee",
        "requester_email": "ann@newco.io",
        "priority": "medium",
        "opened_on": timezone.localdate(),
        "first_seen_at": now,
        "last_seen_at": now,
    }
    values.update(fields)
    return UnmatchedItem.objects.create(**values)
