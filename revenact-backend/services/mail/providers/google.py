"""Google Workspace / Gmail over OAuth 2.0 and the Gmail REST API.

Scopes: gmail.modify, gmail.send and gmail.compose (services/mail/scopes.py),
all three or the connection is refused. Refresh tokens are long-lived;
access tokens are refreshed on demand and the refreshed set is handed back
to the caller to store. `GmailSession` is one mailbox's calls for one pass
of the sync (services/mail/gmail_sync.py).
"""

import base64
import http.client
import time
from datetime import datetime, timezone
from urllib.parse import quote, urlencode

from django.conf import settings

from .. import scopes
from ..mime import Outgoing, build
from .base import (
    Credentials,
    MailProvider,
    Message,
    ProviderError,
    SendUnconfirmed,
    http_json,
    http_upload,
    parse_address,
    parse_address_list,
)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://gmail.googleapis.com/gmail/v1/users/me"
UPLOAD_API = "https://gmail.googleapis.com/upload/gmail/v1/users/me"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
SCOPES = " ".join(scopes.REQUESTED)
#: Token-endpoint reasons that mean the grant itself is gone.
LOST_GRANT = frozenset({"invalid_grant", "invalid_client"})
#: Every change the sync applies (contract §5).
HISTORY_TYPES = ("messageAdded", "messageDeleted", "labelAdded", "labelRemoved")


class GoogleProvider(MailProvider):
    key = "google"
    label = "Google Workspace / Gmail"

    @classmethod
    def configured(cls):
        return bool(settings.GOOGLE_OAUTH_CLIENT_ID and settings.GOOGLE_OAUTH_CLIENT_SECRET)

    def authorize_url(self, state, redirect_uri):
        return (
            AUTH_URL
            + "?"
            + urlencode(
                {
                    "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
                    "redirect_uri": redirect_uri,
                    "response_type": "code",
                    "scope": SCOPES,
                    "access_type": "offline",
                    "prompt": "consent",
                    # Someone adding Calendar to a Gmail connection keeps Gmail.
                    "include_granted_scopes": "true",
                    "state": state,
                }
            )
        )

    def exchange_code(self, code, redirect_uri):
        """The tokens and the scopes Google granted. Reads nothing from the
        mailbox: the caller checks the scopes first, then asks for the
        address (an unticked grant cannot even read the profile)."""
        tokens = http_json(
            "POST",
            TOKEN_URL,
            form={
                "code": code,
                "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
                "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if "refresh_token" not in tokens:
            raise ProviderError(
                "Google did not return a refresh token; reconnect and grant access."
            )
        return Credentials(
            address="",
            data=self._with_expiry(tokens),
            scopes=str(tokens.get("scope", "")).split(),
        )

    # --- tokens -------------------------------------------------------------
    @staticmethod
    def _with_expiry(tokens):
        tokens = dict(tokens)
        tokens["expires_at"] = time.time() + int(tokens.get("expires_in", 3600)) - 60
        return tokens

    def _fresh(self, creds, *, force=False):
        if not force and creds.data.get("expires_at", 0) > time.time():
            return creds
        try:
            tokens = http_json(
                "POST",
                TOKEN_URL,
                form={
                    "refresh_token": creds.data["refresh_token"],
                    "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
                    "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
                    "grant_type": "refresh_token",
                },
            )
        except ProviderError as exc:
            # Only a grant Google says is gone needs the person; a 5xx or a
            # rate limit is retried (contract decision 20).
            lost = exc.reason in LOST_GRANT or exc.status == 401
            raise ProviderError(
                f"Google refused to refresh the token: {exc.status} {exc.reason}".strip(),
                reauth=lost,
                status=exc.status,
                reason=exc.reason,
                retry_after=exc.retry_after,
            ) from exc
        except (OSError, http.client.HTTPException, ValueError) as exc:
            # No answer, or one that is not JSON. Nothing has been sent yet: a
            # plain failure (the draft reopens), never an unconfirmed send.
            # Not a lost grant either.
            raise ProviderError(
                f"Google did not answer the token refresh: {type(exc).__name__}"
            ) from exc
        data = {**creds.data, **self._with_expiry(tokens)}
        return Credentials(
            address=creds.address, display_name=creds.display_name, data=data, scopes=creds.scopes
        )

    @staticmethod
    def _auth(creds):
        return {"Authorization": f"Bearer {creds.data['access_token']}"}

    # --- send ---------------------------------------------------------------
    def send(
        self,
        creds,
        *,
        to,
        subject,
        body,
        in_reply_to="",
        references="",
        thread_id="",
        from_name="",
        cc=(),
        html="",
        headers=None,
    ):
        """Send as the mailbox (D3 section 4, "Today's send routes on a Google
        mailbox"): the MIME builder, text only, no signature, no cc, through
        the upload endpoint, with the original's threadId and headers when it
        answers one (decision 16). No answer after the request went out
        raises SendUnconfirmed."""
        name = from_name or creds.display_name
        raw = build(
            Outgoing(
                from_name=name,
                from_address=creds.address,
                to=[["", address] for address in to],
                cc=[["", address] for address in cc],
                subject=subject,
                text=body,
                html=html,
                in_reply_to=in_reply_to,
                references=references,
                headers=dict(headers or {}),
            )
        )
        sent = GmailSession(creds).send_message(raw, thread_id)
        return Message(
            provider_id=sent.get("id", ""),
            thread_id=sent.get("threadId", ""),
            subject=subject,
            from_address=creds.address,
            from_name=name,
            to=[("", address.lower()) for address in to],
            date=datetime.now(timezone.utc),
            body=body,
            threaded=bool(thread_id),
        )


class GmailSession:
    """One mailbox's Gmail calls for one pass. The access token is refreshed
    when it has expired, and once more on a 401; a second 401 is raised (a
    lost grant). A network failure is a ProviderError with no status. Every
    call here is safe to repeat: the reads, and D2's writes (labels set to a
    target, trash, untrash), which are idempotent. `creds` is what to store
    afterwards."""

    #: Where `path` is resolved, and the hosts that may be called (None: the
    #: mail providers' allow-list). services.calendar.google overrides both.
    base = API
    hosts = None

    def __init__(self, creds):
        self.creds = creds
        self._provider = GoogleProvider()
        self._retried = False

    def _call(self, method, path, *, params=None, data=None):
        url = f"{self.base}{path}" + (f"?{urlencode(params, doseq=True)}" if params else "")
        self.creds = self._provider._fresh(self.creds)
        try:
            return self._send(method, url, data)
        except ProviderError as exc:
            if exc.status != 401 or self._retried:
                raise
        self._retried = True
        self.creds = self._provider._fresh(self.creds, force=True)
        return self._send(method, url, data)

    def _send(self, method, url, data):
        try:
            return http_json(
                method,
                url,
                headers=GoogleProvider._auth(self.creds),
                data=data,
                allowed_hosts=self.hosts,
            )
        except (OSError, http.client.HTTPException, ValueError) as exc:
            # No answer, a broken one, or one that is not JSON: backed off.
            raise ProviderError(f"Google did not answer: {type(exc).__name__}") from exc

    def profile(self):
        return self._call("GET", "/profile")

    def labels(self):
        return self._call("GET", "/labels").get("labels", [])

    def history(self, start_history_id, page_token=""):
        params = {
            "startHistoryId": start_history_id,
            "historyTypes": list(HISTORY_TYPES),
            "maxResults": 500,
        }
        if page_token:
            params["pageToken"] = page_token
        return self._call("GET", "/history", params=params)

    def list_messages(self, q, page_token="", max_results=100):
        params = {"q": q, "maxResults": max_results, "includeSpamTrash": "true"}
        if page_token:
            params["pageToken"] = page_token
        return self._call("GET", "/messages", params=params)

    def get_message(self, message_id, fmt="full"):
        """The message, or None when Gmail no longer has it."""
        try:
            return self._call(
                "GET", f"/messages/{quote(message_id, safe='')}", params={"format": fmt}
            )
        except ProviderError as exc:
            if exc.status == 404:
                return None
            raise

    def batch_modify(self, ids, add, remove):
        """Up to 1,000 messages at once (MAIL_OUTBOX_BATCH_SIZE). Gmail answers 204."""
        return self._call(
            "POST",
            "/messages/batchModify",
            data={"ids": list(ids), "addLabelIds": list(add), "removeLabelIds": list(remove)},
        )

    def modify(self, message_id, add, remove):
        return self._call(
            "POST",
            f"/messages/{quote(message_id, safe='')}/modify",
            data={"addLabelIds": list(add), "removeLabelIds": list(remove)},
        )

    def trash(self, message_id):
        return self._call("POST", f"/messages/{quote(message_id, safe='')}/trash", data={})

    def untrash(self, message_id):
        return self._call("POST", f"/messages/{quote(message_id, safe='')}/untrash", data={})

    def create_label(self, name):
        return self._call(
            "POST",
            "/labels",
            data={
                "name": name,
                "labelListVisibility": "labelShow",
                "messageListVisibility": "show",
            },
        )

    def attachment(self, message_id, attachment_id):
        """`{size, data}` (data base64url), or None when Gmail no longer has it."""
        path = f"/messages/{quote(message_id, safe='')}/attachments/{quote(attachment_id, safe='')}"
        try:
            return self._call("GET", path)
        except ProviderError as exc:
            if exc.status == 404:
                return None
            raise

    def _upload(self, method, path, metadata, raw, *, sending=False):
        """One upload (decision 19), refreshed and retried once on a 401 as
        _call is. `sending`: no answer after the request went out may mean
        Gmail sent it, so it is SendUnconfirmed (D3 §4, settling), never a
        ProviderError that would reopen the draft."""
        url = f"{UPLOAD_API}{path}?uploadType=multipart"
        self.creds = self._provider._fresh(self.creds)
        try:
            return self._put(method, url, metadata, raw, sending)
        except ProviderError as exc:
            if exc.status != 401 or self._retried:
                raise
        self._retried = True
        self.creds = self._provider._fresh(self.creds, force=True)
        return self._put(method, url, metadata, raw, sending)

    def _put(self, method, url, metadata, raw, sending):
        try:
            return http_upload(
                method,
                url,
                headers=GoogleProvider._auth(self.creds),
                metadata=metadata,
                payload=raw,
                timeout=settings.MAIL_SEND_TIMEOUT_SECONDS,
            )
        except (OSError, http.client.HTTPException, ValueError) as exc:
            if sending:
                raise SendUnconfirmed(f"Gmail did not answer: {type(exc).__name__}") from exc
            raise ProviderError(f"Gmail did not answer: {type(exc).__name__}") from exc

    @staticmethod
    def _thread(thread_id):
        return {"threadId": thread_id} if thread_id else {}

    def create_draft(self, raw, thread_id=""):
        return self._upload("POST", "/drafts", {"message": self._thread(thread_id)}, raw)

    def update_draft(self, draft_id, raw, thread_id=""):
        """Gmail replaces the draft's message: the answer names the new one."""
        return self._upload(
            "PUT",
            f"/drafts/{quote(draft_id, safe='')}",
            {"id": draft_id, "message": self._thread(thread_id)},
            raw,
        )

    def delete_draft(self, draft_id):
        return self._call("DELETE", f"/drafts/{quote(draft_id, safe='')}")

    def send_draft(self, draft_id, raw, thread_id=""):
        """Sends the draft with this message (decision 19); never repeated."""
        return self._upload(
            "POST",
            "/drafts/send",
            {"id": draft_id, "message": self._thread(thread_id)},
            raw,
            sending=True,
        )

    def send_message(self, raw, thread_id=""):
        """Sends a message Gmail holds no draft of; never repeated."""
        return self._upload("POST", "/messages/send", self._thread(thread_id), raw, sending=True)

    def list_drafts(self, page_token=""):
        params = {"maxResults": 500}
        if page_token:
            params["pageToken"] = page_token
        return self._call("GET", "/drafts", params=params)

    def send_as(self):
        return self._call("GET", "/settings/sendAs").get("sendAs", [])

    def search(self, q, page_token="", max_results=20):
        """The person's own query (D3 decision 28): spam and trash left out,
        unlike the import's list_messages."""
        params = {"q": q, "maxResults": max_results, "includeSpamTrash": "false"}
        if page_token:
            params["pageToken"] = page_token
        return self._call("GET", "/messages", params=params)

    def metadata(self, message_id, headers):
        """format=metadata with only `headers`, or None when Gmail no longer has it."""
        try:
            return self._call(
                "GET",
                f"/messages/{quote(message_id, safe='')}",
                params={"format": "metadata", "metadataHeaders": list(headers)},
            )
        except ProviderError as exc:
            if exc.status == 404:
                return None
            raise

    def watch(self, topic):
        """Point the mailbox at the Pub/Sub topic, for every label."""
        return self._call("POST", "/watch", data={"topicName": topic})

    def stop(self):
        return self._call("POST", "/stop", data={})


def revoke(token):
    """Ask Google to forget this grant. Best effort: False when it could not
    be done, and the caller logs that and carries on."""
    if not token:
        return False
    try:
        # SOC2:SEC-07 a credential we no longer hold is revoked at its issuer
        http_json("POST", REVOKE_URL, form={"token": token})
    except (ProviderError, OSError, http.client.HTTPException):
        return False
    return True


def _header(payload, name):
    for header in payload.get("headers", []):
        if header.get("name", "").lower() == name.lower():
            return header.get("value", "")
    return ""


def _decode(data):
    return base64.urlsafe_b64decode(data + "==").decode(errors="replace")


def _text_of(part):
    """The first text/plain body in a MIME tree, else text/html, else ''.
    A part with a filename is a file, never the body."""
    mime = part.get("mimeType", "")
    data = part.get("body", {}).get("data")
    if mime == "text/plain" and data and not part.get("filename"):
        return _decode(data)
    html = ""
    for child in part.get("parts", []):
        text = _text_of(child)
        if text and child.get("mimeType") == "text/plain":
            return text
        if text and not html:
            html = text
    if mime == "text/html" and data and not part.get("filename"):
        return _strip_html(_decode(data))
    return html


def _html_of(part):
    """The first text/html body in a MIME tree, raw; '' when there is none."""
    data = part.get("body", {}).get("data")
    if part.get("mimeType") == "text/html" and data and not part.get("filename"):
        return _decode(data)
    for child in part.get("parts", []):
        found = _html_of(child)
        if found:
            return found
    return ""


def _attachments_of(part):
    """Every file part (a filename or an attachment id), depth first. Inline
    means Content-Disposition inline with a Content-ID (a cid: image)."""
    found = []
    body = part.get("body", {})
    if part.get("filename") or body.get("attachmentId"):
        content_id = _header(part, "Content-ID").strip().strip("<>")
        found.append(
            {
                "part_id": part.get("partId", ""),
                "attachment_id": body.get("attachmentId", ""),
                "filename": part.get("filename", ""),
                "mime_type": part.get("mimeType") or "application/octet-stream",
                "size": int(body.get("size") or 0),
                "content_id": content_id,
                "is_inline": _header(part, "Content-Disposition").lower().startswith("inline")
                and bool(content_id),
            }
        )
    for child in part.get("parts", []):
        found.extend(_attachments_of(child))
    return found


def _strip_html(html):
    import re

    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


FOLDER_LABELS = frozenset({"inbox", "sent", "draft", "spam", "trash"})

#: Gmail's label ids, in the store's vocabulary.
GMAIL_LABELS = {
    "INBOX": "inbox",
    "SENT": "sent",
    "DRAFT": "draft",
    "SPAM": "spam",
    "TRASH": "trash",
    "UNREAD": "unread",
    "STARRED": "starred",
    "IMPORTANT": "important",
    "CATEGORY_PROMOTIONS": "promotions",
    "CATEGORY_SOCIAL": "social",
    "CATEGORY_UPDATES": "updates",
    "CATEGORY_FORUMS": "forums",
    "CATEGORY_PERSONAL": "personal",
}


def parse_gmail_message(full) -> Message:
    payload = full.get("payload", {})
    from_name, from_address = parse_address(_header(payload, "From"))
    date = datetime.fromtimestamp(int(full.get("internalDate", "0")) / 1000, tz=timezone.utc)
    headers = {}
    unsubscribe = _header(payload, "List-Unsubscribe")
    if unsubscribe:
        headers["list-unsubscribe"] = unsubscribe
    labels = [GMAIL_LABELS[label] for label in full.get("labelIds", []) if label in GMAIL_LABELS]
    # Gmail's archive is the absence of a folder label: the message exists,
    # and it is in no folder we know. Only when Gmail spoke at all.
    if full.get("labelIds") is not None and not FOLDER_LABELS & set(labels):
        labels.append("archive")
    return Message(
        provider_id=full.get("id", ""),
        thread_id=full.get("threadId", ""),
        subject=_header(payload, "Subject") or "(no subject)",
        from_address=from_address,
        from_name=from_name,
        to=parse_address_list(_header(payload, "To")),
        cc=parse_address_list(_header(payload, "Cc")),
        bcc=parse_address_list(_header(payload, "Bcc")),
        reply_to=parse_address_list(_header(payload, "Reply-To")),
        date=date,
        body=_text_of(payload)[:20000],
        html=_html_of(payload),
        headers=headers,
        labels=labels,
        label_ids=list(full.get("labelIds") or []),
        rfc_message_id=_header(payload, "Message-ID"),
        references=_header(payload, "References"),
        attachments=_attachments_of(payload),
    )
