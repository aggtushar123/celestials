"""Slack: every top-level message in a connection's channels starts a
conversation (Slack escalations D1, D3). Messages arrive by Slack's Events
API (`services/connectors/slack_events.py`); these reads are the slow
catch-up, sized for Slack's 2025 limits on unlisted apps. Connect with a bot
token, or through OAuth when the deployment has a Slack app configured.
"""

import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlencode

from django.conf import settings

from .base import (
    ProviderError,
    RemoteThread,
    SetupField,
    TicketProvider,
    http_call,
    http_json,
)

logger = logging.getLogger(__name__)

API = "https://slack.com/api"
SCOPES = ",".join(
    [
        "channels:history",
        "channels:read",
        # Slack escalations D3 (SC3-5): the bot joins public channels itself
        "channels:join",
        "groups:history",
        "groups:read",
        "users:read",
        "users:read.email",
        "reactions:read",
    ]
)
#: Agent bundles D3: what "Allow agents to act" asks Slack for (D3-9).
ACT_SCOPES = SCOPES + ",chat:write"
#: The metadata a post carries its idempotency key in (D3-11).
METADATA_TYPE = "revenact_step"
REAUTH_ERRORS = ("invalid_auth", "token_revoked", "account_inactive", "not_authed")
PAGE = 200
MAX_PAGES = 5
TEXT_CHARS = 3000
#: Message subtypes kept as a thread's replies (M5: "Also send to channel" is a reply).
REPLY_SUBTYPES = ("", "bot_message", "thread_broadcast")
#: Slack, 2025-05-29: an unlisted app's conversations.history and .replies
#: answer 1 call a minute and at most 15 objects (contract SC3-6).
CATCHUP_LIMIT = 15
#: A lookup made while Slack waits for its 3-second answer (SC3-23).
EVENT_TIMEOUT = 2
#: Slack escalations D4 (SE4-24): a mention in a message's text, <@U0ABC> or <@U0ABC|name>.
MENTION = re.compile(r"<@([UW][A-Z0-9]+)(?:\|[^>]*)?>")
#: users.info lookups a catch-up may add for mentioned people (Tier 4; the rest wait a pass).
MAX_PEOPLE = 30


def mentions(text):
    """The Slack user ids `text` mentions, in order, once each."""
    return list(dict.fromkeys(MENTION.findall(text or "")))


@dataclass
class Budget:
    """One catch-up's replies call (SC3-6)."""

    replies: int = 1
    stopped: bool = False


def is_top(raw):
    """A message that starts a conversation (D1's rules, D3-26): no subtype,
    not a reply, a person's, with text."""
    ts = str(raw.get("ts", ""))
    if raw.get("subtype") or (raw.get("thread_ts") and str(raw["thread_ts"]) != ts):
        return False
    return bool(raw.get("user")) and bool(raw.get("text")) and not raw.get("bot_id")


def is_ours(raw, config, app_id=""):
    """SC3-28, SE4-16: our bot's post, a post carrying our step key, or a
    person's post made through our app (`app_id` is the event envelope's
    api_app_id). The one rule for both: a top message it matches is never a
    thread, and a person's reply it matches is stored `via_app`."""
    identity = _identity(config)
    if raw.get("bot_id") in identity or (raw.get("user") and raw.get("user") in identity):
        return True
    if (raw.get("metadata") or {}).get("event_type") == METADATA_TYPE:
        return True
    return bool(app_id) and raw.get("app_id") == app_id and not raw.get("bot_id")


def ts_time(ts):
    """A Slack ts as an aware UTC datetime."""
    return datetime.fromtimestamp(float(ts), tz=UTC)


def escape(text):
    """Slack's three control characters, escaped as its formatting guide asks."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


_ESCAPED_USER = re.compile(r"&lt;@([UW][A-Z0-9]+)(?:\|[^&]*)?&gt;")


def with_mentions(text, allowed):
    """`text` escaped, then each <@U...> of a person in `allowed` made a real
    mention again (owner, 2026-10-18: the reply read "<@U0C9...>"). Anyone
    else reads "@someone"; <!channel>, <!here>, <!everyone> and links stay
    escaped, so model text still can't ping a channel or a stranger."""
    allowed = set(allowed or ())

    def one(match):
        user_id = match.group(1)
        return f"<@{user_id}>" if user_id in allowed else "@someone"

    return _ESCAPED_USER.sub(one, escape(text))


def ours(message, config):
    """Whether a stored message is our own bot's post (I3): its `ours` mark;
    a message stored before the mark, by its user id against the bot
    identity recorded at connect; with no identity known, any bot's post
    (as before)."""
    if not message.get("bot"):
        return False
    if "ours" in message:
        return bool(message["ours"])
    identity = _identity(config)
    return not identity or message.get("user_id") in identity


def _identity(config):
    config = config or {}
    return {v for v in (config.get("bot_id"), config.get("bot_user_id")) if v}


def message_url(channel, ts, thread_ts=""):
    """A message's page in Slack (the ticket URL's form)."""
    url = f"https://slack.com/archives/{channel}/p{ts.replace('.', '')}"
    return f"{url}?thread_ts={thread_ts}&cid={channel}" if thread_ts else url


class SlackProvider(TicketProvider):
    key = "slack"
    label = "Slack"
    number_prefix = "SL"
    uses_oauth = True
    fields = [
        SetupField("bot_token", "Bot token", secret=True, placeholder="xoxb-…", required=False),
    ]
    help = (
        "Revenact reads every public channel and joins new ones itself once Slack allows "
        "it. Leave the token blank to sign in with Slack when it is set up on this deployment."
    )

    @classmethod
    def oauth_configured(cls):
        return bool(settings.SLACK_OAUTH_CLIENT_ID and settings.SLACK_OAUTH_CLIENT_SECRET)

    @staticmethod
    def _headers(creds):
        return {"Authorization": f"Bearer {creds['bot_token']}"}

    @staticmethod
    def _checked(data):
        """Slack answers 200 with ok=false for a refusal: raise it with its code."""
        if not data.get("ok"):
            error = data.get("error", "unknown_error")
            raise ProviderError(f"Slack: {error}", reauth=error in REAUTH_ERRORS, code=error)
        return data

    def _call(self, creds, method, *, timeout=30, **params):
        query = urlencode({k: v for k, v in params.items() if v not in (None, "")})
        return self._checked(
            http_json(
                "GET", f"{API}/{method}?{query}", headers=self._headers(creds), timeout=timeout
            )
        )

    def _auth_test(self, creds):
        """auth.test's answer and the token's scopes (Slack's X-OAuth-Scopes header)."""
        data, answered = http_call("GET", f"{API}/auth.test", headers=self._headers(creds))
        scopes = [s.strip() for s in answered.get("x-oauth-scopes", "").split(",") if s.strip()]
        return self._checked(data), scopes

    def connect(self, form, *, via="token"):
        """SC3-13: the token alone; the first pass lists the channels."""
        token = (form.get("bot_token") or "").strip()
        if not token:
            raise ProviderError("A bot token is required unless you sign in with Slack.")
        creds = {"bot_token": token}
        me, scopes = self._auth_test(creds)
        config = {
            "team_id": me.get("team_id", ""),
            "bot_name": me.get("user", ""),
            # I3: whose posts are ours (a bot token's auth.test names its bot)
            "bot_id": me.get("bot_id", ""),
            "bot_user_id": me.get("user_id", ""),
            "via": via,
            "scopes": scopes,
        }
        return config, creds

    def authorize_url(self, state, redirect_uri, *, act=False):
        return "https://slack.com/oauth/v2/authorize?" + urlencode(
            {
                "client_id": settings.SLACK_OAUTH_CLIENT_ID,
                "scope": ACT_SCOPES if act else SCOPES,
                "redirect_uri": redirect_uri,
                "state": state,
            }
        )

    def exchange_code(self, code, redirect_uri, form):
        data = http_json(
            "POST",
            f"{API}/oauth.v2.access",
            form={
                "code": code,
                "client_id": settings.SLACK_OAUTH_CLIENT_ID,
                "client_secret": settings.SLACK_OAUTH_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
            },
        )
        if not data.get("ok") or not data.get("access_token"):
            raise ProviderError(f"Slack: {data.get('error', 'no token returned')}")
        config, creds = self.connect({"bot_token": data["access_token"]}, via="oauth")
        granted = [s.strip() for s in str(data.get("scope", "")).split(",") if s.strip()]
        if granted:
            config["scopes"] = granted
        return config, creds

    def granted_scopes(self, creds):
        return self._auth_test(creds)[1]

    def channel_shared(self, creds, channel):
        """Whether `channel` is shared outside the workspace (Slack Connect),
        from conversations.info (SE4-19). Raises ProviderError."""
        info = self._call(creds, "conversations.info", channel=channel).get("channel")
        if not info:
            raise ProviderError("Slack didn't describe the channel.")
        return bool(info.get("is_ext_shared") or info.get("is_pending_ext_shared"))

    def channel_readers(self, creds, channel, *, timeout=EVENT_TIMEOUT):
        """Who can read `channel` (Slack handover, owner 2026-10-18): None
        when it is a public channel (anyone in the workspace), else the set
        of its members' user ids from conversations.members, at most
        MAX_PAGES pages; an empty set when Slack won't say (a DM or group DM
        without im:read / mpim:read, a channel the bot is not in, a refusal
        or too many members to list), so nobody unverified is counted."""
        try:
            info = self._call(creds, "conversations.info", timeout=timeout, channel=channel).get(
                "channel"
            )
        except ProviderError:
            return set()
        if not info:
            return set()
        if not (info.get("is_private") or info.get("is_im") or info.get("is_mpim")):
            return None
        members, cursor = set(), None
        for _ in range(MAX_PAGES):
            try:
                page = self._call(
                    creds,
                    "conversations.members",
                    timeout=timeout,
                    channel=channel,
                    limit=PAGE,
                    cursor=cursor,
                )
            except ProviderError:
                return set()
            members.update(str(uid) for uid in page.get("members") or [])
            cursor = (page.get("response_metadata") or {}).get("next_cursor")
            if not cursor:
                return members
        return set()

    def post_message(self, creds, *, channel, text, thread_ts="", key, mentions=()):
        """Post as the connector's bot, the step's key in the message's
        metadata (D3-11). The new message's ts; ProviderError with Slack's
        code; NoAnswer when the request went out and nothing came back."""
        body = {
            "channel": channel,
            # SOC2:AUTH-02 model text is plain text: escaped, it can't ping <!channel>;
            # only people already in the conversation (`mentions`) are named as mentions.
            "text": with_mentions(text, mentions),
            "unfurl_links": False,
            "unfurl_media": False,
            "metadata": {"event_type": METADATA_TYPE, "event_payload": {"key": key}},
        }
        if thread_ts:
            body["thread_ts"] = thread_ts
        data = http_json(
            "POST",
            f"{API}/chat.postMessage",
            headers={**self._headers(creds), "Content-Type": "application/json; charset=utf-8"},
            data=body,
            timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
            write=True,
        )
        return str(self._checked(data)["ts"])

    def find_message(self, creds, *, channel, key, thread_ts="", oldest=""):
        """The ts of the message carrying `key` (the thread's replies, else the
        channel's top level) since `oldest`, or None (D3-11). Follows Slack's
        cursor for up to MAX_PAGES pages."""
        method = "conversations.replies" if thread_ts else "conversations.history"
        cursor = None
        for _ in range(MAX_PAGES):
            page = self._call(
                creds,
                method,
                timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
                channel=channel,
                ts=thread_ts or None,
                oldest=oldest or None,
                include_all_metadata="true",
                limit=PAGE,
                cursor=cursor,
            )
            for raw in page.get("messages", []):
                meta = raw.get("metadata") or {}
                if (
                    meta.get("event_type") == METADATA_TYPE
                    and (meta.get("event_payload") or {}).get("key") == key
                ):
                    return str(raw.get("ts"))
            cursor = (page.get("response_metadata") or {}).get("next_cursor")
            if not page.get("has_more") or not cursor:
                break
        return None

    def member_channels(self, creds, *, private):
        """Channels this bot is a member of (round 2 D2 contract R2D2-15,
        R2D2-16): Slack's users.conversations, unarchived, public (and
        private when the token holds groups:read), at most MAX_PAGES pages."""
        types = "public_channel,private_channel" if private else "public_channel"
        out, cursor = [], None
        for _ in range(MAX_PAGES):
            page = self._call(
                creds,
                "users.conversations",
                timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
                types=types,
                exclude_archived="true",
                limit=PAGE,
                cursor=cursor,
            )
            for raw in page.get("channels", []):
                out.append(
                    {
                        "id": str(raw.get("id", "")),
                        "name": str(raw.get("name") or "")[:80],
                        "private": bool(raw.get("is_private")),
                    }
                )
            cursor = (page.get("response_metadata") or {}).get("next_cursor")
            if not cursor:
                break
        return out

    def _person(self, creds, user_id, people, *, timeout=30):
        """users.info's name and email for a poster, once per read (`people`);
        nobody is asked about an empty id; a failed lookup is a blank name."""
        if not user_id:
            return {"name": "", "email": ""}
        if user_id not in people:
            try:
                user = self._call(creds, "users.info", timeout=timeout, user=user_id).get(
                    "user", {}
                )
            except ProviderError:
                user = {}
            profile = user.get("profile") or {}
            people[user_id] = {
                "name": user.get("real_name") or profile.get("real_name") or user.get("name", ""),
                "email": (profile.get("email") or "").lower(),
            }
        return people[user_id]

    def list_channels(self, creds):
        """SC3-3: the workspace's public channels, unarchived, at most
        MAX_PAGES pages (Tier 2): [{"id", "name", "member", "shared"}]."""
        out, cursor = [], None
        for _ in range(MAX_PAGES):
            page = self._call(
                creds,
                "conversations.list",
                types="public_channel",
                exclude_archived="true",
                limit=PAGE,
                cursor=cursor,
            )
            for raw in page.get("channels", []):
                out.append(
                    {
                        "id": str(raw.get("id", "")),
                        "name": str(raw.get("name") or "")[:80],
                        "member": bool(raw.get("is_member")),
                        "shared": bool(raw.get("is_ext_shared")),
                    }
                )
            cursor = (page.get("response_metadata") or {}).get("next_cursor")
            if not cursor:
                break
        return out

    def _people_of(self, creds, thread, people, looked, resolved):
        """SE4-24: {user id: {"name", "email"}} for the thread's posters and
        the people its messages mention. Someone already looked up this pass
        costs nothing; someone the conversation already knows as a member
        (`resolved`) is not asked about again (F11); a new one is looked up
        while the pass has room (MAX_PEOPLE), else left for the next pass."""
        messages = [
            {"user_id": thread.user_id, "text": thread.text, "bot": False},
            *(thread.replies or []),
        ]
        ids = [m["user_id"] for m in messages if m.get("user_id") and not m.get("bot")]
        for message in messages:
            ids += mentions(message.get("text"))
        out = {}
        for user_id in dict.fromkeys(ids):
            if user_id not in people:
                if user_id in resolved or looked[0] >= MAX_PEOPLE:
                    continue
                looked[0] += 1
            out[user_id] = dict(self._person(creds, user_id, people))
        return out

    def join_channel(self, creds, channel, *, timeout=30):
        """SC3-5: the bot joins a public channel (Tier 3). ProviderError with Slack's code."""
        self._checked(
            http_json(
                "POST",
                f"{API}/conversations.join",
                headers=self._headers(creds),
                form={"channel": channel},
                timeout=timeout,
                write=True,
            )
        )

    def reply_of(self, creds, config, raw, people, *, timeout=30, app_id=""):
        """One reply as stored (SE1-4, I3): people's and bots' (`bot`), our
        bot's marked `ours`, a person's post made through our app marked
        `via_app` (SC3-28; D4 reads it); None for a parent, a join, a topic
        change or an empty text. Shared by the catch-up and the events (SC3-24)."""
        ts = str(raw.get("ts", ""))
        thread = str(raw.get("thread_ts") or "")
        subtype = raw.get("subtype") or ""
        if not thread or ts == thread or subtype not in REPLY_SUBTYPES or not raw.get("text"):
            return None
        identity = _identity(config)
        bot = bool(raw.get("bot_id")) or subtype == "bot_message"
        user_id = str(raw.get("user", ""))
        mine = bot and (not identity or raw.get("bot_id") in identity or user_id in identity)
        if mine:
            name = config.get("bot_name") or "the Slack app"
        elif bot:
            name = (
                (raw.get("bot_profile") or {}).get("name") or raw.get("username") or "a Slack app"
            )
        else:
            name = self._person(creds, user_id, people, timeout=timeout)["name"]
        out = {
            "ts": ts,
            "user_id": user_id,
            "name": str(name)[:150],
            "text": str(raw["text"])[:TEXT_CHARS],
            "bot": bot,
            "ours": mine,
        }
        if not bot and is_ours(raw, config, app_id):
            out["via_app"] = True
        return out

    def thread_of(
        self, creds, config, channel, raw, *, replies=None, latest="", people=None, timeout=30
    ):
        """A top message as a RemoteThread. `replies` None: keep what is stored."""
        people = {} if people is None else people
        ts = str(raw["ts"])
        user_id = str(raw.get("user", ""))
        poster = self._person(creds, user_id, people, timeout=timeout)
        return RemoteThread(
            thread_ts=ts,
            channel=channel,
            text=str(raw.get("text") or "")[:TEXT_CHARS],
            user_id=user_id,
            user_name=poster["name"][:150],
            user_email=poster["email"][:254],
            posted_at=ts_time(ts),
            latest_reply=latest,
            replies=replies,
            url=message_url(channel, ts),
        )

    def read_page(self, config, creds, *, channel, oldest, latest=""):
        """SC3-6: ONE conversations.history call of CATCHUP_LIMIT messages
        between `oldest` and `latest` (blank: now), newest first as Slack
        sends them: (the top messages oldest first, has_more, the lowest ts on
        the page, where a walk continues)."""
        page = self._call(
            creds,
            "conversations.history",
            channel=channel,
            oldest=oldest,
            latest=latest or None,
            limit=CATCHUP_LIMIT,
            # our step key (D3-11): a person's post made through our app is ours
            include_all_metadata="true",
        )
        raws = page.get("messages", [])
        lowest = min((str(raw.get("ts", "")) for raw in raws), key=float, default="")
        mine = [raw for raw in raws if is_top(raw) and not is_ours(raw, config)]
        tops = sorted(mine, key=lambda raw: float(raw["ts"]))
        return tops, bool(page.get("has_more")), lowest

    def read_thread(self, config, creds, *, channel, thread_ts, since="", people=None):
        """SC3-6: ONE conversations.replies call of CATCHUP_LIMIT messages:
        (the parent as Slack sent it, or None when the page lacks it; the
        replies after `since`, oldest first)."""
        people = {} if people is None else people
        page = self._call(
            creds,
            "conversations.replies",
            channel=channel,
            ts=thread_ts,
            oldest=since or None,
            limit=CATCHUP_LIMIT,
            include_all_metadata="true",
        )
        raws = page.get("messages", [])
        parent = next((raw for raw in raws if str(raw.get("ts", "")) == thread_ts), None)
        replies = [m for m in (self.reply_of(creds, config, raw, people) for raw in raws) if m]
        return parent, sorted(replies, key=lambda m: float(m["ts"]))
