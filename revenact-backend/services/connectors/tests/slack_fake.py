"""The Slack Web API in memory (agent bundles D3), standing in for the Slack
provider's `http_json` and `http_call`. It answers auth.test (with
X-OAuth-Scopes), conversations.info, oauth.v2.access, chat.postMessage,
conversations.members, conversations.replies, conversations.history (paged by `limit` and
`cursor`, as Slack does) and users.info, keeps every post with its
metadata and every call's timeout, and can refuse or drop the next call to
a method. Nothing leaves the process."""

import json
import time
from urllib.parse import parse_qs, urlsplit

from services.connectors.providers.base import NoAnswer, ProviderError

BASE_SCOPES = (
    "channels:history",
    "channels:read",
    "channels:join",
    "groups:history",
    "groups:read",
    "users:read",
    "users:read.email",
    "reactions:read",
)


class FakeSlackApi:
    def __init__(self, *, scopes=BASE_SCOPES, team="T0ACME", bot="revenact"):
        self.scopes = list(scopes)
        self.team = team
        self.bot = bot
        #: channel id -> [message dicts], oldest first
        self.channels = {"C0SUPPORT": [], "C0ESCALATE": []}
        self.names = {"C0SUPPORT": "support", "C0ESCALATE": "escalations"}
        #: channel ids the bot is in, and which of them are private
        self.members = {"C0SUPPORT", "C0ESCALATE"}
        self.private = set()
        #: user id -> users.info "user"; an unknown id answers Ann Lee (as before)
        self.users = {
            "U0ANN": {"real_name": "Ann Lee", "profile": {"email": "ann@pizzahut.com"}},
            "U0FAIZ": {"real_name": "Faiz Jamal", "profile": {"email": "faiz@acme.io"}},
            "U0CARL": {"real_name": "Carl Lee", "profile": {"email": "carl@acme.io"}},
        }
        #: channel id -> member user ids (conversations.members); others: channel_not_found
        self.channel_members = {}
        #: channels shared outside the workspace (Slack Connect)
        self.shared = set()
        #: channels whose Slack Connect invite is pending; channels answered with no channel object
        self.pending_shared, self.no_info = set(), set()
        #: channels conversations.join refuses (method_not_supported_for_channel_type)
        self.cant_join = set()
        self.calls = []
        #: (method, bearer token) per call: whose token each call used
        self.auth = []
        #: tokens auth.revoke was called with
        self.revoked = []
        #: (response_url, body) of every answer sent through a payload's response_url
        self.hooks = []
        #: who a user-scope OAuth (a person's Slack link) signs in as, in which team
        self.authed_user = "U0CARL"
        self.authed_team = team
        self.timeouts = []
        self._refuse = {}
        self._drop = set()
        # Posts are stamped from now, so a Retry's look-back window (D3-11) finds them.
        self._ts = int(time.time())

    # --- what a test scripts -------------------------------------------
    def refuse_next(self, method, error):
        """The next call to `method` answers {"ok": false, "error": error}."""
        self._refuse[method] = error

    def drop_next(self, method):
        """The next call to `method` is done, then its answer is lost (NoAnswer)."""
        self._drop.add(method)

    def say(self, channel, user, text, *, thread_ts=None):
        """A person's message (a top message, or a reply when `thread_ts`)."""
        self._ts += 1
        ts = f"{self._ts}.000200"
        message = {"ts": ts, "user": user, "text": text}
        if thread_ts:
            message["thread_ts"] = thread_ts
        self.channels[channel].append(message)
        return ts

    def posts(self, channel="C0SUPPORT"):
        return [m for m in self.channels.get(channel, []) if m.get("bot_id")]

    # --- the transports ---------------------------------------------------
    def __call__(self, method, url, *, headers=None, data=None, form=None, timeout=30, write=False):
        return self.call(
            method, url, headers=headers, data=data, form=form, timeout=timeout, write=write
        )[0]

    def call(self, method, url, *, headers=None, data=None, form=None, timeout=30, write=False):
        parts = urlsplit(url)
        if parts.hostname == "hooks.slack.com":
            self.hooks.append((url, data))
            return {"ok": True}, {}
        name = parts.path.rsplit("/", 1)[-1]
        self.timeouts.append((name, timeout))
        query = {k: v[0] for k, v in parse_qs(parts.query).items()}
        body = data if data is not None else (form or {})
        self.calls.append((name, json.loads(json.dumps(body)), query))
        bearer = (headers or {}).get("Authorization", "")
        self.auth.append((name, bearer.removeprefix("Bearer ")))
        if name in self._refuse:
            return {"ok": False, "error": self._refuse.pop(name)}, {}
        answer, answered = self._route(name, query, body)
        if name in self._drop:
            self._drop.discard(name)
            raise NoAnswer(f"slack.com did not answer {name}")
        return answer, answered

    def _route(self, name, query, body):
        if name == "auth.test":
            return (
                {
                    "ok": True,
                    "team_id": self.team,
                    "user": self.bot,
                    "user_id": "U0BOT",
                    "bot_id": "B0BOT",
                },
                {"x-oauth-scopes": ",".join(self.scopes)},
            )
        if name == "conversations.info":
            channel = query.get("channel", "")
            if channel not in self.channels:
                return {"ok": False, "error": "channel_not_found"}, {}
            if channel in self.no_info:
                return {"ok": True}, {}
            return {
                "ok": True,
                "channel": {
                    "id": channel,
                    "name": self.names[channel],
                    "is_member": channel in self.members,
                    "is_private": channel in self.private,
                    "is_im": channel.startswith("D"),
                    "is_ext_shared": channel in self.shared,
                    "is_pending_ext_shared": channel in self.pending_shared,
                },
            }, {}
        if name == "conversations.members":
            channel = query.get("channel", "")
            if channel not in self.channel_members:
                return {"ok": False, "error": "channel_not_found"}, {}
            every = list(self.channel_members[channel])
            offset = int(query.get("cursor") or 0)
            size = int(query.get("limit") or 100)
            more = offset + size < len(every)
            return {
                "ok": True,
                "members": every[offset : offset + size],
                "response_metadata": {"next_cursor": str(offset + size) if more else ""},
            }, {}
        if name == "oauth.v2.access":
            if body.get("code") == "bad":
                return {"ok": False, "error": "invalid_code"}, {}
            return {
                "ok": True,
                "access_token": "xoxb-granted",
                "scope": ",".join(self.scopes),
                "team": {"id": self.authed_team},
                # A user-scope grant (a person's Slack link) answers for the person too.
                "authed_user": {
                    "id": self.authed_user,
                    "scope": "chat:write,users:read",
                    "access_token": f"xoxp-{self.authed_user.lower()}",
                    "token_type": "user",
                },
            }, {}
        if name == "auth.revoke":
            self.revoked.append(self.auth[-1][1])
            return {"ok": True, "revoked": True}, {}
        if name == "chat.postMessage":
            channel = body["channel"]
            if channel not in self.channels:
                return {"ok": False, "error": "channel_not_found"}, {}
            self._ts += 1
            ts = f"{self._ts}.000100"
            message = {"ts": ts, "text": body["text"], "metadata": body.get("metadata")}
            token = self.auth[-1][1]
            if token.startswith("xoxp-"):
                # A person's own token posts as them (Connections spec §3 "post as me").
                message["user"] = token.removeprefix("xoxp-").upper()
            else:
                message["bot_id"] = "B0BOT"
            if body.get("thread_ts"):
                message["thread_ts"] = body["thread_ts"]
            self.channels[channel].append(message)
            return {"ok": True, "channel": channel, "ts": ts}, {}
        if name in ("conversations.replies", "conversations.history"):
            channel = query.get("channel", "")
            oldest = float(query.get("oldest") or 0)
            thread = query.get("ts")
            every = self.channels.get(channel, [])

            def replies_of(ts):
                return [m for m in every if m.get("thread_ts") == ts and m["ts"] != ts]

            if thread:
                parent = [m for m in every if m["ts"] == thread]
                # Slack's `oldest` is exclusive (inclusive=false by default)
                rows = parent + [m for m in replies_of(thread) if float(m["ts"]) > oldest]
            else:
                latest = float(query.get("latest") or "inf")
                rows = []
                for m in every:
                    if m.get("thread_ts") not in (None, m["ts"]) or float(m["ts"]) < oldest:
                        continue
                    if float(m["ts"]) >= latest:
                        continue
                    found = replies_of(m["ts"])
                    if found:
                        m = {
                            **m,
                            "thread_ts": m["ts"],
                            "reply_count": len(found),
                            "latest_reply": max((r["ts"] for r in found), key=float),
                        }
                    rows.append(m)
                # Slack's conversations.history answers newest first
                rows.sort(key=lambda m: float(m["ts"]), reverse=True)
            if query.get("include_all_metadata") != "true":
                rows = [{k: v for k, v in m.items() if k != "metadata"} for m in rows]
            offset = int(query.get("cursor") or 0)
            size = int(query.get("limit") or 100)
            more = offset + size < len(rows)
            answer = {"ok": True, "messages": rows[offset : offset + size], "has_more": more}
            if more:
                answer["response_metadata"] = {"next_cursor": str(offset + size)}
            return answer, {}
        if name == "conversations.list":
            wanted = set(query.get("types", "public_channel").split(","))
            ids = sorted(
                c
                for c in self.channels
                if ("private_channel" if c in self.private else "public_channel") in wanted
            )
            offset = int(query.get("cursor") or 0)
            size = int(query.get("limit") or 100)
            page = [
                {
                    "id": c,
                    "name": self.names.get(c, c.lower()),
                    "is_private": c in self.private,
                    "is_member": c in self.members,
                    "is_ext_shared": c in self.shared,
                    "is_archived": False,
                }
                for c in ids[offset : offset + size]
            ]
            more = offset + size < len(ids)
            return {
                "ok": True,
                "channels": page,
                "response_metadata": {"next_cursor": str(offset + size) if more else ""},
            }, {}
        if name == "conversations.join":
            channel = body.get("channel", "")
            if channel not in self.channels:
                return {"ok": False, "error": "channel_not_found"}, {}
            if channel in self.cant_join:
                return {"ok": False, "error": "method_not_supported_for_channel_type"}, {}
            self.members.add(channel)
            return {"ok": True, "channel": {"id": channel, "name": self.names.get(channel, "")}}, {}
        if name == "users.info":
            user = self.users.get(
                query.get("user", ""),
                {"real_name": "Ann Lee", "profile": {"email": "ann@pizzahut.com"}},
            )
            return {"ok": True, "user": user}, {}
        if name == "users.conversations":
            wanted = set(query.get("types", "public_channel").split(","))
            ids = sorted(
                c
                for c in self.members
                if ("private_channel" if c in self.private else "public_channel") in wanted
            )
            offset = int(query.get("cursor") or 0)
            size = int(query.get("limit") or 100)
            page = [
                {
                    "id": c,
                    "name": self.names.get(c, c.lower()),
                    "is_private": c in self.private,
                    "is_archived": False,
                }
                for c in ids[offset : offset + size]
            ]
            more = offset + size < len(ids)
            return {
                "ok": True,
                "channels": page,
                "response_metadata": {"next_cursor": str(offset + size) if more else ""},
            }, {}
        raise ProviderError(f"FakeSlackApi has no route for {name}")


def use_slack(testcase, fake=None):
    """`fake` (or a new FakeSlackApi) stands in for Slack for the rest of the test."""
    from unittest.mock import patch

    fake = fake or FakeSlackApi()
    for target, stand_in in (
        ("services.connectors.providers.slack.http_json", fake),
        ("services.connectors.providers.slack.http_call", fake.call),
    ):
        patcher = patch(target, stand_in)
        patcher.start()
        testcase.addCleanup(patcher.stop)
    return fake
