"""The thread's decision (Slack escalations D4, contract SE4-22 to SE4-25,
spec §5.2 and §5.3). The model reads the whole Slack thread and may name
the message that gives the work to someone; this module keeps that only
when the thread says it (the quote is in that message, a person wrote it,
a member wrote it, it is more than a bare mention), resolves who it names
(a mention through the thread's `people`, which the sync filled from Slack
links and Slack emails; else a plain name among the thread's people, then
the workspace), and lists the thread's participants. It reads the context
only: the workspace's active members are `ctx.members`. A dropped decision
is logged as a code, never its text."""

import logging
import re
from dataclasses import dataclass

from services.connectors import slack_text
from services.connectors.providers.slack import MENTION

logger = logging.getLogger(__name__)

#: Words a bare mention may carry and still be one (SE4-23).
FILLER = frozenset({"cc", "fyi", "ping", "fwiw", "see", "also", "heads", "up", "+1"})
QUOTE_CHARS = 200


@dataclass(frozen=True)
class Decision:
    #: the member who wrote the deciding message
    by: object
    #: the deciding words as people read them (a mention as "@Name"),
    #: whitespace folded, at most QUOTE_CHARS
    quote: str
    #: who the thread named, as the panel shows it (a mention's Slack name)
    named: str
    #: the deciding message's ts
    ts: str
    #: the member it names, or None (spec §5.3 rule 4)
    user: object


def fold(text):
    return " ".join(str(text or "").casefold().split())


def bare(quote):
    """SE4-23: True when, without mentions, punctuation and filler, no word is left."""
    # a Slack mention, or a name typed with "@" ("@Faiz"), is a mention
    text = re.sub(r"@\w+", " ", MENTION.sub(" ", quote or ""))
    words = re.sub(r"[^\w+]+", " ", text).casefold().split()
    return not [word for word in words if word not in FILLER]


def _member_pk(ctx, entry):
    """The id of the active member a `people` entry is, else None."""
    pk = (entry or {}).get("member")
    # SOC2:AUTH-02 only an active member of this workspace (ctx.members)
    if not isinstance(pk, int) or isinstance(pk, bool) or pk not in ctx.members:
        return None
    return pk


def _member(ctx, entry):
    """The active member a `people` entry is, else None."""
    pk = _member_pk(ctx, entry)
    return None if pk is None else ctx.member(pk)


def _named(name):
    folded = fold(name)
    return {folded, folded.split()[0]} if folded else set()


def resolve(assignee, ctx, people):
    """SE4-24: (the member `assignee` names or None, the name the panel shows)."""
    mention = MENTION.search(assignee or "")
    if mention:
        entry = people.get(mention.group(1))
        if entry is None:
            return None, assignee.strip()
        return _member(ctx, entry), entry.get("name") or assignee.strip()
    written = assignee.strip().lstrip("@").strip()
    wanted = fold(written)
    hits = [entry for entry in people.values() if wanted in _named(entry.get("name"))]
    # a thread person is resolved as in (1): a guest with no member is nobody
    if len(hits) == 1:
        return _member(ctx, hits[0]), written
    if len(hits) > 1:
        return None, written
    full = [pk for pk, row in ctx.members.items() if fold(row["name"]) == wanted]
    if full:
        return (ctx.member(full[0]) if len(full) == 1 else None), written
    first = [pk for pk, row in ctx.members.items() if fold(row["name"]).split()[:1] == [wanted]]
    return (ctx.member(first[0]) if len(first) == 1 else None), written


def shown(quote, people):
    """The quote as people read it: each <@U...> as "@<their Slack name>"."""
    return slack_text.named(quote, people)


def _dropped(code):
    logger.info("agents: a thread decision was dropped: %s", code)
    return None


def read(answer, ctx):
    """SE4-22: the thread's Decision, or None (no decision, or one the thread doesn't say)."""
    raw = getattr(answer, "decision", None)
    slack = ctx.thread_slack
    if not raw or slack is None:
        return None
    messages = slack.get("messages") or []
    index = raw["message"] - (slack.get("first") or 1)
    if not 0 <= index < len(messages):
        return _dropped("no_message")
    message = messages[index]
    if message.get("bot") or message.get("via_app"):
        return _dropped("not_a_person")
    people = slack.get("people") or {}
    author = _member(ctx, people.get(message.get("user_id")))
    if author is None:
        return _dropped("author_not_a_member")
    # prompt._decision already cut the quote to QUOTE_CHARS: a cut quote is a
    # prefix of the words, so it is still in the message when they are
    # CC-14: the lines name mentions ("@Faiz Jamal"); the stored text has <@U...>
    quote = " ".join(slack_text.unnamed(raw["quote"], people).split())
    if fold(quote) not in fold(message.get("text")):
        return _dropped("quote_not_in_message")
    if bare(quote):
        return _dropped("bare_mention")
    user, named = resolve(raw["assignee"], ctx, people)
    return Decision(
        by=author,
        quote=shown(quote, people)[:QUOTE_CHARS],
        named=named,
        ts=str(message.get("ts", "")),
        user=user,
    )


def participants(ctx):
    """SE4-25: the active members who wrote in the thread (not a bot's post,
    not our own reply), in the order they first wrote, once each."""
    slack = ctx.thread_slack or {}
    people = slack.get("people") or {}
    found = []
    for message in slack.get("messages") or []:
        if message.get("bot") or message.get("via_app"):
            continue
        pk = _member_pk(ctx, people.get(message.get("user_id")))
        if pk is not None:
            found.append(pk)
    return list(dict.fromkeys(found))
