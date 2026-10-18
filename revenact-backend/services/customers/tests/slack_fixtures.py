"""Slack conversations for tests (Slack escalations D1): fake channels, fake
people, nothing read from Slack."""

from itertools import count

from django.utils import timezone

from services.customers.models import Account, SlackConversation

_n = count(1)


def msg(ts, name="Faiz Jamal", text="Exports fail since this morning.", bot=False):
    return {"ts": ts, "user_id": "" if bot else "U0FAIZ", "name": name, "text": text, "bot": bot}


def conversation(parent, connector=None, **fields):
    """A conversation filed on `parent` (a Customer or an Account)."""
    n = next(_n)
    ts = fields.pop("thread_ts", f"17920414{n:02d}.000100")
    values = {
        "connector": connector,
        "department": connector.department if connector is not None else "",
        "channel": "C0SUPPORT",
        "channel_name": "support",
        "thread_ts": ts,
        "title": "Exports fail since this morning.",
        "messages": [msg(ts)],
        "started_by_name": "Faiz Jamal",
        "started_by_email": "faiz@example.com",
        "url": f"https://slack.com/archives/C0SUPPORT/p{ts.replace('.', '')}",
        "last_message_at": timezone.now(),
        "matched_by": SlackConversation.MatchedBy.NAME,
    }
    values.update(fields)
    on = {"account": parent} if isinstance(parent, Account) else {"customer": parent}
    return SlackConversation.objects.create(**on, **values)
