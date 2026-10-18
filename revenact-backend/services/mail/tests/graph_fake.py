"""Microsoft Graph's mail routes in memory (agent bundles D3), standing in
for the Microsoft provider's `http_json`: the Message-ID lookup and reply
(round 2 D1 R2D1-13: `held` maps a Message-ID to the mailbox's copy, its
Graph id and conversationId; `replies` keeps each reply as posted;
`reply_gone` answers a reply with 404), sendMail (kept with its cc,
internetMessageHeaders and extended properties; `posted` keeps each message
as posted) and Sent Items listed since a time, filtered on an extended
property when asked. Like Graph's Sent Items copy, a listed message carries
no internetMessageHeaders. A test can refuse or drop the next send. Nothing
leaves the process."""

import re
import time
from datetime import UTC, datetime
from urllib.parse import parse_qs, unquote, urlsplit

from services.mail.models import MailboxConnection
from services.mail.providers.base import ProviderError, SendUnconfirmed

#: Far from expiry, so no test refreshes a token.
CREDENTIALS = {
    "access_token": "graph-token",
    "refresh_token": "r",
    "expires_at": time.time() + 10**8,
}


class FakeGraph:
    def __init__(self):
        self.sent = []
        self.posted = []
        self.calls = []
        self._refuse = None
        self._drop = False
        self._refuse_lookup = None
        self.held = {}
        self.replies = []
        self.reply_gone = False

    def refuse_next(self, status, *, reauth=False):
        self._refuse = (status, reauth)

    def refuse_lookup(self, status, *, reauth=False):
        """The next Message-ID lookup is refused (a lost grant when `reauth`)."""
        self._refuse_lookup = (status, reauth)

    def drop_next(self):
        self._drop = True

    def __call__(
        self, method, url, *, headers=None, data=None, form=None, timeout=30, allowed_hosts=None
    ):
        parts = urlsplit(url)
        self.calls.append((method, parts.path))
        if parts.path.endswith("/me/messages") and method == "GET":
            if self._refuse_lookup:
                status, reauth = self._refuse_lookup
                self._refuse_lookup = None
                raise ProviderError(
                    f"{status} from graph.microsoft.com", reauth=reauth, status=status
                )
            query = {k: v[0] for k, v in parse_qs(parts.query).items()}
            wanted = re.search(r"internetMessageId eq '((?:[^']|'')*)'", query["$filter"])
            rfc = wanted.group(1).replace("''", "'") if wanted else ""
            found = self.held.get(rfc)
            return {"value": [{"id": found[0], "conversationId": found[1]}] if found else []}
        replying = re.search(r"/me/messages/([^/]+)/reply$", parts.path)
        if replying and method == "POST":
            target = unquote(replying.group(1))
            if self.reply_gone or target not in {gid for gid, _ in self.held.values()}:
                raise ProviderError("404 from graph.microsoft.com", status=404)
            if self._refuse:
                status, reauth = self._refuse
                self._refuse = None
                raise ProviderError(
                    f"{status} from graph.microsoft.com", reauth=reauth, status=status
                )
            message = data["message"]
            self.replies.append({"id": target, "message": message})
            conversation = next(c for gid, c in self.held.values() if gid == target)
            self.sent.append(
                {
                    "id": f"graph-{len(self.sent) + 1}",
                    "to": [],
                    "cc": [r["emailAddress"]["address"] for r in message.get("ccRecipients", [])],
                    "subject": message["subject"],
                    "body": message["body"]["content"],
                    "internetMessageHeaders": [],
                    "properties": {
                        p["id"]: p["value"]
                        for p in message.get("singleValueExtendedProperties", [])
                    },
                    "sentDateTime": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "conversationId": conversation,
                }
            )
            if self._drop:
                self._drop = False
                raise SendUnconfirmed("Graph did not answer")
            return {}
        if parts.path.endswith("/me/sendMail"):
            if self._refuse:
                status, reauth = self._refuse
                self._refuse = None
                raise ProviderError(
                    f"{status} from graph.microsoft.com", reauth=reauth, status=status
                )
            message = data["message"]
            self.posted.append(message)
            self.sent.append(
                {
                    "id": f"graph-{len(self.sent) + 1}",
                    "to": [r["emailAddress"]["address"] for r in message["toRecipients"]],
                    "cc": [r["emailAddress"]["address"] for r in message.get("ccRecipients", [])],
                    "subject": message["subject"],
                    "body": message["body"]["content"],
                    "internetMessageHeaders": message.get("internetMessageHeaders", []),
                    "properties": {
                        p["id"]: p["value"]
                        for p in message.get("singleValueExtendedProperties", [])
                    },
                    "sentDateTime": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "conversationId": "",
                }
            )
            if self._drop:
                self._drop = False
                raise SendUnconfirmed("Graph did not answer")
            return {}
        if parts.path.endswith("/me/mailFolders/sentitems/messages"):
            query = {k: v[0] for k, v in parse_qs(parts.query).items()}
            since = re.search(r"sentDateTime ge (\S+)", query["$filter"]).group(1)
            rows = [m for m in self.sent if m["sentDateTime"] >= since]
            stamp = re.search(r"ep/id eq '([^']*)' and ep/value eq '([^']*)'", query["$filter"])
            if stamp:
                rows = [m for m in rows if m["properties"].get(stamp.group(1)) == stamp.group(2)]
            return {
                "value": [
                    {"id": m["id"], "conversationId": m.get("conversationId", "")} for m in rows
                ]
            }
        raise AssertionError(f"FakeGraph has no route for {method} {parts.path}")


def use_graph(testcase, fake=None):
    from unittest.mock import patch

    fake = fake or FakeGraph()
    patcher = patch("services.mail.providers.microsoft.http_json", fake)
    patcher.start()
    testcase.addCleanup(patcher.stop)
    return fake


def outlook_connection(user):
    connection = MailboxConnection.objects.create(
        organisation=user.organisation,
        user=user,
        provider=MailboxConnection.Provider.MICROSOFT,
        address=user.email,
        display_name=user.name,
        credentials="",
    )
    connection.set_credentials(dict(CREDENTIALS))
    connection.save(update_fields=["credentials"])
    return connection
