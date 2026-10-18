"""Slack's message markup read as the person saw it in Slack: people by name,
channels by name, links with their address, common emoji as emoji. Used by
Send to Revenact (Connections spec §3) before a message is summarised and
kept, so the Work item reads like the message, not like Slack's wire format."""

import re

#: People looked up per message at most; the rest read "@someone".
MAX_LOOKUPS = 10

_TOKEN = re.compile(r"<([^<>]+)>")
_USER = re.compile(r"<@([UW][A-Z0-9]+)(?:\|[^<>]*)?>")
_EMOJI = re.compile(r":([a-z0-9_+\-]+):(?::skin-tone-[2-6]:)?")

#: The shortcodes people actually type; any other one stays as written.
EMOJI = {
    "wave": "👋",
    "+1": "👍",
    "thumbsup": "👍",
    "-1": "👎",
    "thumbsdown": "👎",
    "pray": "🙏",
    "clap": "👏",
    "raised_hands": "🙌",
    "ok_hand": "👌",
    "muscle": "💪",
    "point_up": "☝️",
    "point_right": "👉",
    "eyes": "👀",
    "fire": "🔥",
    "rocket": "🚀",
    "tada": "🎉",
    "100": "💯",
    "heart": "❤️",
    "white_check_mark": "✅",
    "heavy_check_mark": "✔️",
    "x": "❌",
    "warning": "⚠️",
    "rotating_light": "🚨",
    "exclamation": "❗",
    "question": "❓",
    "bulb": "💡",
    "memo": "📝",
    "calendar": "📅",
    "email": "📧",
    "phone": "📞",
    "lock": "🔒",
    "bug": "🐛",
    "hourglass": "⌛",
    "sos": "🆘",
    "smile": "😄",
    "slightly_smiling_face": "🙂",
    "grinning": "😀",
    "joy": "😂",
    "sweat_smile": "😅",
    "wink": "😉",
    "thinking_face": "🤔",
    "neutral_face": "😐",
    "confused": "😕",
    "disappointed": "😞",
    "cry": "😢",
    "sob": "😭",
    "rage": "😡",
    "angry": "😠",
    "scream": "😱",
    "sunglasses": "😎",
    "upside_down_face": "🙃",
    "face_palm": "🤦",
    "facepalm": "🤦",
    "shrug": "🤷",
    "see_no_evil": "🙈",
    "star": "⭐",
    "sparkles": "✨",
    "zap": "⚡",
    "chart_with_upwards_trend": "📈",
    "chart_with_downwards_trend": "📉",
    "moneybag": "💰",
    "handshake": "🤝",
    "coffee": "☕",
}


def mentioned(text):
    """The Slack user ids named in `text`, each once, at most MAX_LOOKUPS."""
    seen = []
    for user_id in _USER.findall(text or ""):
        if user_id not in seen:
            seen.append(user_id)
    return seen[:MAX_LOOKUPS]


def _token(body, name_of):
    head, _, label = body.partition("|")
    if head.startswith("@"):
        name = name_of(head[1:])
        return f"@{name or label or 'someone'}"
    if head.startswith("#"):
        return f"#{label or 'channel'}"
    if head.startswith("!"):
        word = head[1:]
        if word in ("here", "channel", "everyone"):
            return f"@{word}"
        return label or f"@{word.split('^', 1)[0]}"
    if head.startswith("mailto:"):
        return label or head[len("mailto:") :]
    if label and label != head:
        return f"{label} ({head})"
    return head


def readable(text, name_of):
    """`text` as Slack showed it. `name_of(user_id)` gives a person's name or
    "" (asked only for ids `mentioned` returns; others read "@someone")."""
    allowed = set(mentioned(text))

    def lookup(user_id):
        return name_of(user_id) if user_id in allowed else ""

    out = _TOKEN.sub(lambda m: _token(m.group(1), lookup), text or "")
    out = _EMOJI.sub(lambda m: EMOJI.get(m.group(1), m.group(0)), out)
    # Slack escapes only these three; &amp; last so "&amp;lt;" stays "&lt;".
    return out.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")


def named(text, people):
    """`text` with each <@U...> as "@<name>" from a conversation's stored
    `people` ({id: {"name": ...}}); one with no known name stays as written
    (Slack escalations D4, CC-14). The stored text is never changed."""
    people = people or {}

    def name(match):
        entry = people.get(match.group(1)) or {}
        return f"@{entry['name']}" if entry.get("name") else match.group(0)

    return _USER.sub(name, text or "")


def unnamed(text, people):
    """`named` read back: each "@<name>" of a known person (any case) as their
    <@U...>, longest names first."""
    out = text or ""
    known = [(uid, str((p or {}).get("name") or "")) for uid, p in (people or {}).items()]
    for uid, name in sorted(known, key=lambda row: -len(row[1])):
        if name:
            pattern = re.compile(rf"@{re.escape(name)}(?!\w)", re.IGNORECASE)
            out = pattern.sub(lambda _m, uid=uid: f"<@{uid}>", out)
    return out
