"""A Gmail mailbox in memory, standing in for `http_json` in tests.

Patch `services.mail.providers.google.http_json` with an instance (or use
GmailFixture.use_gmail) and the provider, the session, the sync and the
views talk to it as they would to Google: the token endpoint, revoke, and
the Gmail REST routes D1 calls. Bodies follow the recorded shapes in
fixtures/gmail/; a failure arrives as the ProviderError http_json raises
for the same answer. History pages hold two records each and list pages
honour maxResults, so paging is always exercised. D2's writes (batchModify,
modify, trash, untrash, labels.create) change the mailbox and record history
as Gmail does, and attachments.get serves `attach_file`'s bytes. D3's
uploads (drafts.create, drafts.update, drafts.send, messages.send) are
parsed and stored as Gmail would, drafts.list pages two at a time, and
sendAs, search and format=metadata answer.
"""

import base64
import copy
import email
import json
import re
import time
from datetime import UTC, datetime
from email import policy
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from services.mail import scopes
from services.mail.providers.base import RATE_LIMIT_REASONS, ProviderError

FIXTURES = Path(__file__).parent / "fixtures" / "gmail"
GRANTED_SCOPE = " ".join(
    [
        *scopes.TWO_WAY,
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
    ]
)
API_PREFIX = "/gmail/v1/users/me"
UPLOAD_PREFIX = "/upload/gmail/v1/users/me"


def fixture(name):
    return json.loads((FIXTURES / name).read_text())


def _b64(text):
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


def gmail_message(
    message_id,
    *,
    labels=("INBOX", "UNREAD"),
    sender="Sam Pizza <sam@pizzahut.com>",
    to="dana@acme.io",
    cc="",
    bcc="",
    subject="Renewal",
    text="Can we talk about the renewal?",
    html="",
    sent_at=None,
    thread_id=None,
    references="",
    reply_to="",
    attachments=(),
):
    """A `messages.get?format=full` body in Gmail's shape. `attachments` are
    dicts of filename, mime_type, size and optionally inline / content_id."""
    sent_at = sent_at or datetime.now(UTC)
    headers = [
        {"name": "From", "value": sender},
        {"name": "To", "value": to},
        {"name": "Subject", "value": subject},
        {"name": "Message-ID", "value": f"<{message_id}@mail.gmail.com>"},
    ]
    for name, value in (
        ("Cc", cc),
        ("Bcc", bcc),
        ("References", references),
        ("Reply-To", reply_to),
    ):
        if value:
            headers.append({"name": name, "value": value})
    alternative = [
        {
            "partId": "0.0",
            "mimeType": "text/plain",
            "filename": "",
            "headers": [],
            "body": {"size": len(text), "data": _b64(text)},
        }
    ]
    if html:
        alternative.append(
            {
                "partId": "0.1",
                "mimeType": "text/html",
                "filename": "",
                "headers": [],
                "body": {"size": len(html), "data": _b64(html)},
            }
        )
    parts = [
        {
            "partId": "0",
            "mimeType": "multipart/alternative",
            "filename": "",
            "headers": [],
            "body": {"size": 0},
            "parts": alternative,
        }
    ]
    for n, item in enumerate(attachments, start=1):
        disposition = "inline" if item.get("inline") else "attachment"
        part_headers = [
            {
                "name": "Content-Disposition",
                "value": f'{disposition}; filename="{item["filename"]}"',
            }
        ]
        if item.get("content_id"):
            part_headers.append({"name": "Content-ID", "value": f"<{item['content_id']}>"})
        parts.append(
            {
                "partId": str(n),
                "mimeType": item["mime_type"],
                "filename": item["filename"],
                "headers": part_headers,
                "body": {"attachmentId": f"ANGjdJ{message_id}{n}", "size": item["size"]},
            }
        )
    return {
        "id": message_id,
        "threadId": thread_id or message_id,
        "labelIds": list(labels),
        "snippet": text[:100],
        "historyId": "1",
        "internalDate": str(int(sent_at.timestamp() * 1000)),
        "sizeEstimate": 1000,
        "payload": {
            "partId": "",
            "mimeType": "multipart/mixed",
            "filename": "",
            "headers": headers,
            "body": {"size": 0},
            "parts": parts,
        },
    }


def _not_found():
    return ProviderError("404 from gmail.googleapis.com: notFound", status=404, reason="notFound")


def _find_part(part, part_id):
    if part.get("partId") == part_id:
        return part
    for child in part.get("parts", []):
        found = _find_part(child, part_id)
        if found is not None:
            return found
    return None


def _metadata_part(part, wanted):
    """A payload as format=metadata gives it: the asked headers, no bodies."""
    return {
        "partId": part.get("partId", ""),
        "mimeType": part.get("mimeType", ""),
        "filename": part.get("filename", ""),
        "headers": [h for h in part.get("headers", []) if h["name"].lower() in wanted],
        "body": {"size": (part.get("body") or {}).get("size", 0)},
        "parts": [_metadata_part(child, wanted) for child in part.get("parts", [])],
    }


def _subject(full):
    for header in full["payload"]["headers"]:
        if header["name"].lower() == "subject":
            return header["value"]
    return ""


class FakeGmail:
    HISTORY_PAGE = 2
    DRAFTS_PAGE = 2

    def __init__(self, address="dana@acme.io"):
        self.address = address
        self.messages = {}
        self.labels = fixture("labels_list.json")["labels"]
        self.history_id = 1000
        self.records = []
        self.oldest_history = 0
        self.failures = []
        self.calls = []
        self.revoked = []
        self.watched = []
        self.stopped = 0
        self.granted_scope = GRANTED_SCOPE
        #: "invalid_grant" makes every token refresh fail as Google does.
        self.refresh_reason = ""
        #: (route, body) of every POST, oldest first.
        self.writes = []
        #: attachment id -> bytes (attach_file).
        self.files = {}
        self._next_file = 0
        #: (method, route, metadata, the parsed message) of every upload.
        self.uploads = []
        #: Gmail draft id -> the draft's message id.
        self.drafts = {}
        self._minted = 0
        #: users.settings.sendAs.list.
        self.send_as = [
            {
                "sendAsEmail": address,
                "displayName": "Dana Ruiz",
                "signature": '<div dir="ltr">Dana Ruiz<br>Acme</div>',
                "isPrimary": True,
                "isDefault": True,
            }
        ]

    # --- the mailbox, as a test changes it ---------------------------------
    def _record(self, **change):
        self.history_id += 1
        self.records.append({"id": str(self.history_id), **change})

    def _stub(self, message_id):
        full = self.messages[message_id]
        return {"id": message_id, "threadId": full["threadId"], "labelIds": list(full["labelIds"])}

    def add(self, full, *, quietly=False):
        """Gmail receives `full`. `quietly`: it was there before (no history)."""
        self.messages[full["id"]] = copy.deepcopy(full)
        if not quietly:
            self._record(messagesAdded=[{"message": self._stub(full["id"])}])
        return full["id"]

    def relabel(self, message_id, labels):
        self.messages[message_id]["labelIds"] = list(labels)
        self._record(labelsAdded=[{"message": self._stub(message_id), "labelIds": list(labels)}])

    def remove(self, message_id):
        self.messages.pop(message_id)
        self._record(messagesDeleted=[{"message": {"id": message_id, "threadId": message_id}}])

    def forget_history(self):
        """Gmail drops its old history: a start before today's id answers 404."""
        self.oldest_history = self.history_id

    def fail(self, pattern, status, reason="", *, retry_after=None, times=1):
        """The next `times` calls whose path matches `pattern` fail."""
        for _ in range(times):
            self.failures.append((re.compile(pattern), status, reason, retry_after))

    def attach_file(self, message_id, part_id, data, *, in_payload=False):
        """Gmail holds `data` as that part's bytes. Under a fresh attachment id
        (Gmail rotates them), or, `in_payload`, inline in the part's body as
        Gmail sends small parts."""
        part = _find_part(self.messages[message_id]["payload"], part_id)
        if in_payload:
            part["body"] = {"size": len(data), "data": base64.urlsafe_b64encode(data).decode()}
            return
        self._next_file += 1
        attachment_id = f"ANGjdJrotated{self._next_file}"
        part["body"] = {"attachmentId": attachment_id, "size": len(data)}
        self.files[attachment_id] = data

    def _mint(self, prefix):
        self._minted += 1
        return f"{prefix}{self._minted}"

    def _store_raw(self, message_id, thread_id, labels, raw):
        """An uploaded message stored as Gmail would, its files attachable."""
        parsed = email.message_from_bytes(raw, policy=policy.default)
        text = html = ""
        files = []
        for part in parsed.walk():
            if part.is_multipart():
                continue
            if part.get_filename():
                files.append(part)
            elif part.get_content_type() == "text/plain" and not text:
                text = part.get_content()
            elif part.get_content_type() == "text/html" and not html:
                html = part.get_content()
        full = gmail_message(
            message_id,
            labels=labels,
            sender=str(parsed["From"] or ""),
            to=str(parsed["To"] or ""),
            cc=str(parsed["Cc"] or ""),
            bcc=str(parsed["Bcc"] or ""),
            subject=str(parsed["Subject"] or ""),
            text=text,
            html=html,
            thread_id=thread_id,
            references=str(parsed["References"] or ""),
            attachments=[
                {
                    "filename": part.get_filename(),
                    "mime_type": part.get_content_type(),
                    "size": len(part.get_payload(decode=True) or b""),
                    "inline": part.get_content_disposition() == "inline",
                    "content_id": str(part["Content-ID"] or "").strip("<>"),
                }
                for part in files
            ],
        )
        # Agent bundles D3: an agent reply's key header is kept, as Gmail keeps it.
        if parsed["X-Revenact-Step"]:
            full["payload"]["headers"].append(
                {"name": "X-Revenact-Step", "value": str(parsed["X-Revenact-Step"])}
            )
        self.add(full)
        for n, part in enumerate(files, start=1):
            self.attach_file(message_id, str(n), part.get_payload(decode=True) or b"")
        return message_id

    def write_draft(self, full):
        """A draft written in Gmail itself; its draft id."""
        full = copy.deepcopy(full)
        full["labelIds"] = ["DRAFT"]
        self.add(full)
        draft_id = self._mint("r-")
        self.drafts[draft_id] = full["id"]
        return draft_id

    def edit_draft(self, draft_id, full):
        """The draft edited in Gmail: its message replaced by `full`."""
        self.remove(self.drafts[draft_id])
        full = copy.deepcopy(full)
        full["labelIds"] = ["DRAFT"]
        self.add(full)
        self.drafts[draft_id] = full["id"]

    def send_in_gmail(self, draft_id):
        """Sent from Gmail itself: the message keeps its id and becomes SENT."""
        self.relabel(self.drafts.pop(draft_id), ["SENT"])

    def discard_in_gmail(self, draft_id):
        self.remove(self.drafts.pop(draft_id))

    def _draft_page(self, query):
        items = [
            {
                "id": draft_id,
                "message": {"id": message_id, "threadId": self.messages[message_id]["threadId"]},
            }
            for draft_id, message_id in self.drafts.items()
        ]
        offset = int(query.get("pageToken") or 0)
        body = {"resultSizeEstimate": len(items)}
        page = items[offset : offset + self.DRAFTS_PAGE]
        if page:
            body["drafts"] = page
        if offset + self.DRAFTS_PAGE < len(items):
            body["nextPageToken"] = str(offset + self.DRAFTS_PAGE)
        return body

    def _failing(self, netloc, path):
        for i, (pattern, status, reason, retry_after) in enumerate(self.failures):
            if pattern.search(path):
                del self.failures[i]
                raise ProviderError(
                    f"{status} from {netloc}: {reason}",
                    reauth=status == 401 or (status == 403 and reason not in RATE_LIMIT_REASONS),
                    status=status,
                    reason=reason,
                    retry_after=retry_after,
                )

    # --- http_upload ------------------------------------------------------
    def upload(self, method, url, *, headers=None, metadata=None, payload=b"", timeout=30):
        parts = urlsplit(url)
        self.calls.append((method, parts.netloc + parts.path, dict(parse_qs(parts.query))))
        self._failing(parts.netloc, parts.path)
        assert parts.path.startswith(UPLOAD_PREFIX), parts.path
        route = parts.path[len(UPLOAD_PREFIX) :]
        metadata = copy.deepcopy(metadata or {})
        self.uploads.append(
            (method, route, metadata, email.message_from_bytes(payload, policy=policy.default))
        )
        thread = (metadata.get("message") or {}).get("threadId", "")
        if route == "/drafts" and method == "POST":
            draft_id, message_id = self._mint("r-"), self._mint("d")
            self._store_raw(message_id, thread or message_id, ["DRAFT"], payload)
            self.drafts[draft_id] = message_id
            return {"id": draft_id, "message": self._stub(message_id)}
        if route == "/drafts/send":
            draft_id = metadata.get("id", "")
            if draft_id not in self.drafts:
                raise _not_found()
            old = self.drafts.pop(draft_id)
            thread = self.messages[old]["threadId"]
            self.remove(old)
            message_id = self._store_raw(self._mint("s"), thread, ["SENT"], payload)
            return self._stub(message_id)
        update = re.fullmatch(r"/drafts/([^/]+)", route)
        if update and method == "PUT":
            draft_id = update.group(1)
            if draft_id not in self.drafts:
                raise _not_found()
            old = self.drafts[draft_id]
            thread = thread or self.messages[old]["threadId"]
            self.remove(old)
            message_id = self._store_raw(self._mint("d"), thread, ["DRAFT"], payload)
            self.drafts[draft_id] = message_id
            return {"id": draft_id, "message": self._stub(message_id)}
        if route == "/messages/send":
            thread = metadata.get("threadId", "")
            message_id = self._mint("s")
            self._store_raw(message_id, thread or message_id, ["SENT"], payload)
            return self._stub(message_id)
        raise AssertionError(f"FakeGmail has no upload route for {method} {parts.path}")

    def _known_labels(self):
        return {label["id"] for label in self.labels}

    def _change(self, message_id, add, remove):
        full = self.messages[message_id]
        labels = [label for label in full["labelIds"] if label not in remove]
        labels += [label for label in add if label not in labels]
        full["labelIds"] = labels
        if add:
            self._record(labelsAdded=[{"message": self._stub(message_id), "labelIds": list(add)}])
        if remove:
            self._record(
                labelsRemoved=[{"message": self._stub(message_id), "labelIds": list(remove)}]
            )

    def _modify(self, ids, data):
        add, remove = data.get("addLabelIds", []), data.get("removeLabelIds", [])
        for label in [*add, *remove]:
            if label not in self._known_labels():
                raise ProviderError(
                    f"400 from gmail.googleapis.com: Invalid label: {label}",
                    status=400,
                    reason="invalidArgument",
                )
        if any(message_id not in self.messages for message_id in ids):
            raise _not_found()
        for message_id in ids:
            self._change(message_id, add, remove)
        return {}

    def _create_label(self, data):
        name = data["name"]
        if any(label["name"].lower() == name.lower() for label in self.labels):
            raise ProviderError(
                "409 from gmail.googleapis.com: Label name exists or conflicts",
                status=409,
                reason="alreadyExists",
            )
        label = {
            "id": f"Label_{100 + len(self.labels)}",
            "name": name,
            "type": "user",
            "messageListVisibility": data.get("messageListVisibility", "show"),
            "labelListVisibility": data.get("labelListVisibility", "labelShow"),
        }
        self.labels.append(label)
        return copy.deepcopy(label)

    def _attachment(self, message_id, attachment_id):
        if message_id not in self.messages or attachment_id not in self.files:
            raise _not_found()
        data = self.files[attachment_id]
        return {"size": len(data), "data": base64.urlsafe_b64encode(data).decode().rstrip("=")}

    # --- http_json --------------------------------------------------------
    def __call__(
        self, method, url, *, headers=None, data=None, form=None, timeout=30, allowed_hosts=None
    ):
        parts = urlsplit(url)
        query = {k: v if len(v) > 1 else v[0] for k, v in parse_qs(parts.query).items()}
        self.calls.append((method, parts.netloc + parts.path, query))
        self._failing(parts.netloc, parts.path)
        if parts.netloc == "oauth2.googleapis.com":
            return self._oauth(parts.path, form or {})
        assert parts.path.startswith(API_PREFIX), parts.path
        route = parts.path[len(API_PREFIX) :]
        if method in ("POST", "DELETE"):
            self.writes.append((route, copy.deepcopy(data)))
        if route == "/profile":
            return {
                "emailAddress": self.address,
                "messagesTotal": len(self.messages),
                "threadsTotal": len(self.messages),
                "historyId": str(self.history_id),
            }
        if route == "/labels":
            if method == "POST":
                return self._create_label(data)
            return {"labels": copy.deepcopy(self.labels)}
        if route == "/messages/batchModify":
            return self._modify(data["ids"], data)
        write = re.fullmatch(r"/messages/([^/]+)/(modify|trash|untrash)", route)
        if write:
            message_id, verb = write.groups()
            if message_id not in self.messages:
                raise _not_found()
            if verb == "modify":
                self._modify([message_id], data)
            elif verb == "trash":
                self._change(message_id, ["TRASH"], [])
            else:
                self._change(message_id, [], ["TRASH"])
            return self._stub(message_id)
        attachment = re.fullmatch(r"/messages/([^/]+)/attachments/([^/]+)", route)
        if attachment:
            return self._attachment(*attachment.groups())
        draft = re.fullmatch(r"/drafts/([^/]+)", route)
        if draft and method == "DELETE":
            draft_id = draft.group(1)
            if draft_id not in self.drafts:
                raise _not_found()
            self.remove(self.drafts.pop(draft_id))
            return {}
        if route == "/drafts":
            return self._draft_page(query)
        if route == "/settings/sendAs":
            return {"sendAs": copy.deepcopy(self.send_as)}
        if route == "/history":
            return self._history(query)
        if route == "/messages":
            return self._list(query)
        if route.startswith("/messages/"):
            return self._get(route.rsplit("/", 1)[-1], query.get("format", "full"), query)
        if route == "/watch":
            self.watched.append(data["topicName"])
            expiration = int((time.time() + 7 * 86400) * 1000)
            return {"historyId": str(self.history_id), "expiration": str(expiration)}
        if route == "/stop":
            self.stopped += 1
            return {}
        raise AssertionError(f"FakeGmail has no route for {method} {parts.path}")

    def _oauth(self, path, form):
        if path == "/revoke":
            self.revoked.append(form.get("token"))
            return {}
        grant = form.get("grant_type")
        if grant == "refresh_token" and self.refresh_reason:
            raise ProviderError(
                f"400 from oauth2.googleapis.com: {self.refresh_reason}",
                status=400,
                reason=self.refresh_reason,
            )
        tokens = {
            "access_token": f"fake-access-{len(self.calls)}",
            "expires_in": 3599,
            "scope": self.granted_scope,
            "token_type": "Bearer",
        }
        if grant == "authorization_code":
            tokens["refresh_token"] = "fake-refresh"
        return tokens

    def _history(self, query):
        start = int(query["startHistoryId"])
        if start < self.oldest_history:
            raise _not_found()
        newer = [r for r in self.records if int(r["id"]) > start]
        offset = int(query.get("pageToken") or 0)
        page = newer[offset : offset + self.HISTORY_PAGE]
        body = {"historyId": str(self.history_id)}
        if page:
            body["history"] = copy.deepcopy(page)
        if offset + self.HISTORY_PAGE < len(newer):
            body["nextPageToken"] = str(offset + self.HISTORY_PAGE)
        return body

    def _list(self, query):
        q = query.get("q", "")
        after = re.search(r"after:(\d+)", q)
        before = re.search(r"before:(\d+)", q)

        def wanted(full):
            seconds = int(full["internalDate"]) // 1000
            if "-in:chats" in q and "CHAT" in full["labelIds"]:
                return False
            if query.get("includeSpamTrash") == "false" and {"SPAM", "TRASH"} & set(
                full["labelIds"]
            ):
                return False
            words = [word.strip("()").lower() for word in q.split() if ":" not in word]
            haystack = f"{_subject(full)} {full.get('snippet', '')}".lower()
            if any(word not in haystack for word in words):
                return False
            if after and seconds <= int(after.group(1)):
                return False
            return not (before and seconds >= int(before.group(1)))

        rows = sorted(
            (m for m in self.messages.values() if wanted(m)),
            key=lambda m: int(m["internalDate"]),
            reverse=True,
        )
        token = query.get("pageToken", "")
        if token and not token.startswith("p"):
            raise ProviderError(
                "400 from gmail.googleapis.com: invalid pageToken", status=400, reason="invalid"
            )
        offset = int(token[1:]) if token else 0
        size = int(query.get("maxResults", 100))
        page = rows[offset : offset + size]
        body = {"resultSizeEstimate": len(rows)}
        if page:
            body["messages"] = [{"id": m["id"], "threadId": m["threadId"]} for m in page]
        if offset + size < len(rows):
            body["nextPageToken"] = f"p{offset + size}"
        return body

    def _get(self, message_id, fmt, query=None):
        full = self.messages.get(message_id)
        if full is None:
            raise _not_found()
        if fmt == "minimal":
            keep = ("id", "threadId", "labelIds", "snippet", "historyId", "internalDate")
            return {k: copy.deepcopy(full[k]) for k in keep}
        if fmt == "metadata":
            wanted = (query or {}).get("metadataHeaders", [])
            wanted = {wanted.lower()} if isinstance(wanted, str) else {h.lower() for h in wanted}
            keep = ("id", "threadId", "labelIds", "snippet", "historyId", "internalDate")
            body = {k: copy.deepcopy(full[k]) for k in keep}
            body["payload"] = _metadata_part(full["payload"], wanted)
            return body
        return copy.deepcopy(full)
