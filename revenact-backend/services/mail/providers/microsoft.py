"""Microsoft 365 / Outlook over OAuth 2.0 and Microsoft Graph."""

import http.client
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urlencode

from django.conf import settings

from .base import Credentials, MailProvider, Message, ProviderError, http_json

GRAPH = "https://graph.microsoft.com/v1.0"
SCOPES = "offline_access User.Read Mail.Read Mail.Send"
#: Revenact's own MAPI property namespace: a sent message's x-headers are
#: stamped here too, because Graph's Sent Items copy usually drops them
#: (agent bundles D3-11).
STAMP_GUID = "e23288be-0cca-47dd-827b-5634bf469d0f"


def _login(path):
    tenant = settings.MICROSOFT_OAUTH_TENANT or "common"
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/{path}"


class MicrosoftProvider(MailProvider):
    key = "microsoft"
    label = "Microsoft 365 / Outlook"

    @classmethod
    def configured(cls):
        return bool(settings.MICROSOFT_OAUTH_CLIENT_ID and settings.MICROSOFT_OAUTH_CLIENT_SECRET)

    def authorize_url(self, state, redirect_uri):
        return (
            _login("authorize")
            + "?"
            + urlencode(
                {
                    "client_id": settings.MICROSOFT_OAUTH_CLIENT_ID,
                    "redirect_uri": redirect_uri,
                    "response_type": "code",
                    "response_mode": "query",
                    "scope": SCOPES,
                    "state": state,
                }
            )
        )

    def exchange_code(self, code, redirect_uri):
        tokens = http_json(
            "POST",
            _login("token"),
            form={
                "code": code,
                "client_id": settings.MICROSOFT_OAUTH_CLIENT_ID,
                "client_secret": settings.MICROSOFT_OAUTH_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
                "scope": SCOPES,
            },
        )
        if "refresh_token" not in tokens:
            raise ProviderError(
                "Microsoft did not return a refresh token; reconnect and grant access."
            )
        creds = Credentials(address="", data=self._with_expiry(tokens))
        me = http_json("GET", f"{GRAPH}/me", headers=self._auth(creds))
        creds.address = (me.get("mail") or me.get("userPrincipalName") or "").lower()
        creds.display_name = me.get("displayName", "")
        return creds

    @staticmethod
    def _with_expiry(tokens):
        tokens = dict(tokens)
        tokens["expires_at"] = time.time() + int(tokens.get("expires_in", 3600)) - 60
        return tokens

    def _fresh(self, creds):
        if creds.data.get("expires_at", 0) > time.time():
            return creds
        try:
            tokens = http_json(
                "POST",
                _login("token"),
                form={
                    "refresh_token": creds.data["refresh_token"],
                    "client_id": settings.MICROSOFT_OAUTH_CLIENT_ID,
                    "client_secret": settings.MICROSOFT_OAUTH_CLIENT_SECRET,
                    "grant_type": "refresh_token",
                    "scope": SCOPES,
                },
            )
        except ProviderError as exc:
            raise ProviderError(
                f"Microsoft refused to refresh the token: {exc}", reauth=True
            ) from exc
        except (OSError, http.client.HTTPException) as exc:
            # Nothing has been sent yet: a plain failure (the draft reopens),
            # never an unconfirmed send. Not a lost grant either.
            raise ProviderError(
                f"Microsoft did not answer the token refresh: {type(exc).__name__}"
            ) from exc
        return Credentials(
            address=creds.address,
            display_name=creds.display_name,
            data={**creds.data, **self._with_expiry(tokens)},
        )

    @staticmethod
    def _auth(creds):
        return {"Authorization": f"Bearer {creds.data['access_token']}"}

    def fetch_messages(self, creds, cursor):
        creds = self._fresh(creds)
        if cursor:
            since = cursor
        else:
            start = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(days=30)
            since = start.isoformat().replace("+00:00", "Z")
        params = {
            "$filter": f"lastModifiedDateTime ge {since}",
            "$orderby": "lastModifiedDateTime asc",
            "$top": "50",
            "$select": ",".join(
                [
                    "id",
                    "conversationId",
                    "subject",
                    "from",
                    "toRecipients",
                    "ccRecipients",
                    "receivedDateTime",
                    "sentDateTime",
                    "lastModifiedDateTime",
                    "body",
                    "bodyPreview",
                    "isDraft",
                    "isRead",
                    "flag",
                    "importance",
                    "parentFolderId",
                ]
            ),
        }
        folders = self._folder_ids(creds)
        url = f"{GRAPH}/me/messages?{urlencode(params)}"
        found, newest = [], since
        while url and len(found) < 500:
            page = http_json("GET", url, headers=self._auth(creds))
            for item in page.get("value", []):
                found.append(parse_graph_message(item, folders))
                newest = max(newest, item.get("lastModifiedDateTime", since))
            url = page.get("@odata.nextLink")
        return found, newest, creds

    def _folder_ids(self, creds):
        """Graph names folders by opaque id; the well-known ones resolve to
        one each. Resolved once and kept in the credentials, which the sync
        stores back, so a mailbox costs these calls once rather than every
        pass. A folder that cannot be resolved simply is not labelled."""
        cached = creds.data.get("folder_ids")
        if cached:
            return dict(cached)
        folders = {}
        for known, label in WELL_KNOWN_FOLDERS.items():
            try:
                item = http_json(
                    "GET", f"{GRAPH}/me/mailFolders/{known}?$select=id", headers=self._auth(creds)
                )
            except ProviderError:
                continue
            if item.get("id"):
                folders[item["id"]] = label
        if folders:
            creds.data["folder_ids"] = folders
        return folders

    def held(self, creds, internet_message_id):
        """(Graph id, conversationId) of this mailbox's copy of the message
        with that Message-ID, or None (R2D1-13). Only a lost grant is raised:
        anything else reads as not held, and the send falls back to sendMail."""
        quoted = internet_message_id.replace("'", "''")
        params = urlencode(
            {
                "$filter": f"internetMessageId eq '{quoted}'",
                "$select": "id,conversationId",
                "$top": "1",
            }
        )
        try:
            page = http_json(
                "GET",
                f"{GRAPH}/me/messages?{params}",
                headers=self._auth(creds),
                timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
            )
        except ProviderError as exc:
            if exc.reauth:
                raise
            return None
        except (OSError, http.client.HTTPException):
            return None
        for item in page.get("value", []):
            if item.get("id"):
                return item["id"], item.get("conversationId", "")
        return None

    def _reply(self, creds, held, *, to, subject, body, cc, headers):
        """Graph's reply to the held copy; None when it is gone (404: nothing sent)."""
        graph_id, conversation = held
        message = {"subject": subject, "body": {"contentType": "Text", "content": body}}
        if cc:
            message["ccRecipients"] = [{"emailAddress": {"address": a}} for a in cc]
        if headers:
            # The stamp only (R2D1-14): a Retry's Sent Items lookup reads it.
            message["singleValueExtendedProperties"] = [
                {"id": _stamp_id(name), "value": value} for name, value in headers.items()
            ]
        try:
            http_json(
                "POST",
                f"{GRAPH}/me/messages/{quote(graph_id, safe='')}/reply",
                headers=self._auth(creds),
                data={"message": message},
            )
        except ProviderError as exc:
            if exc.status == 404:
                return None
            raise
        return Message(
            provider_id="",
            thread_id=conversation,
            subject=subject,
            from_address=creds.address,
            from_name=creds.display_name,
            to=[("", a.lower()) for a in to],
            date=datetime.now(timezone.utc),
            body=body,
            threaded=True,
        )

    def send(
        self, creds, *, to, subject, body, in_reply_to="", cc=(), headers=None, in_thread=False
    ):
        creds = self._fresh(creds)
        # R2D1-13: In-Reply-To through Graph's reply when this mailbox holds
        # the original and the reply goes to its sender (Graph adds recipients
        # to a reply's own, so To is never passed).
        if in_thread and in_reply_to:
            held = self.held(creds, in_reply_to)
            if held is not None:
                replied = self._reply(
                    creds, held, to=to, subject=subject, body=body, cc=cc, headers=headers
                )
                if replied is not None:
                    return replied
        # Graph's sendMail sets only "x-" headers: In-Reply-To can't be sent.
        message = {
            "subject": subject,
            "body": {"contentType": "Text", "content": body},
            "toRecipients": [{"emailAddress": {"address": a}} for a in to],
        }
        # Only what was asked for: a person's own send posts what it always did.
        if cc:
            message["ccRecipients"] = [{"emailAddress": {"address": a}} for a in cc]
        if headers:
            message["internetMessageHeaders"] = [
                {"name": name, "value": value} for name, value in headers.items()
            ]
            message["singleValueExtendedProperties"] = [
                {"id": _stamp_id(name), "value": value} for name, value in headers.items()
            ]
        http_json(
            "POST",
            f"{GRAPH}/me/sendMail",
            headers=self._auth(creds),
            data={"message": message, "saveToSentItems": True},
        )
        return Message(
            provider_id="",
            thread_id="",
            subject=subject,
            from_address=creds.address,
            from_name=creds.display_name,
            to=[("", a.lower()) for a in to],
            date=datetime.now(timezone.utc),
            body=body,
        )

    def find_sent(self, creds, *, header, value, since):
        """(the Sent Items item `{"id", "conversationId"}` stamped `header: value` since
        `since`, the credentials as refreshed). Agent bundles D3-11: the
        stamp is the extended property `send` wrote, which Graph filters on
        server side, so no page of recent mail can hide it."""
        creds = self._fresh(creds)
        when = since.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        quoted = value.replace("'", "''")
        params = urlencode(
            {
                "$filter": (
                    f"sentDateTime ge {when} and singleValueExtendedProperties/Any("
                    f"ep: ep/id eq '{_stamp_id(header)}' and ep/value eq '{quoted}')"
                ),
                "$select": "id,conversationId",
                "$top": "1",
            }
        )
        page = http_json(
            "GET", f"{GRAPH}/me/mailFolders/sentitems/messages?{params}", headers=self._auth(creds)
        )
        for item in page.get("value", []):
            return item, creds
        return None, creds


def _stamp_id(name):
    """A header's extended property id in Revenact's namespace."""
    return f"String {{{STAMP_GUID}}} Name {name}"


def _recipient(entry):
    address = entry.get("emailAddress", {})
    return (address.get("name", ""), address.get("address", "").lower())


#: Graph's well-known folder names, in the store's vocabulary.
WELL_KNOWN_FOLDERS = {
    "inbox": "inbox",
    "sentitems": "sent",
    "drafts": "draft",
    "junkemail": "spam",
    "deleteditems": "trash",
    "archive": "archive",
}


def parse_graph_message(item, folders=None) -> Message:
    sender = item.get("from", {}).get("emailAddress", {})
    labels = []
    folder = (folders or {}).get(item.get("parentFolderId", ""))
    if item.get("isDraft"):
        labels.append("draft")
    elif folder:
        labels.append(folder)
    elif folders:
        # The folders resolved and this is none of them: filed away by the
        # person, which is what archive means. Unresolved folders say nothing.
        labels.append("archive")
    if item.get("isRead") is False:
        labels.append("unread")
    if (item.get("flag") or {}).get("flagStatus") == "flagged":
        labels.append("starred")
    if item.get("importance") == "high":
        labels.append("important")
    body = item.get("body", {})
    text = body.get("content", "") if body.get("contentType", "").lower() == "text" else ""
    if not text:
        from .google import _strip_html

        text = _strip_html(body.get("content", "")) or item.get("bodyPreview", "")
    when = item.get("sentDateTime") or item.get("receivedDateTime") or "1970-01-01T00:00:00Z"
    return Message(
        provider_id=item.get("id", ""),
        thread_id=item.get("conversationId", ""),
        subject=item.get("subject") or "(no subject)",
        from_address=sender.get("address", "").lower(),
        from_name=sender.get("name", ""),
        to=[_recipient(r) for r in item.get("toRecipients", []) + item.get("ccRecipients", [])],
        date=datetime.fromisoformat(when.replace("Z", "+00:00")),
        body=text[:20000],
        labels=labels,
    )
