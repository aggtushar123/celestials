"""Signed Slack Events API deliveries for tests (Slack escalations D3,
contract §3.3). A fresh signing secret per run, never a real one; fake
teams, channels and people. Nothing leaves the process."""

import hashlib
import hmac
import itertools
import json
import secrets
import time

URL = "/api/v1/connectors/slack/events/"
#: A fresh signing secret per run: never a real one.
SIGNING = secrets.token_hex(16)
APP = "A0OURS"
_ids = itertools.count(1)


def sign(body, *, secret=SIGNING, at=None):
    stamp = str(int(at if at is not None else time.time()))
    digest = hmac.new(secret.encode(), f"v0:{stamp}:".encode() + body, hashlib.sha256)
    return stamp, "v0=" + digest.hexdigest()


def message(channel, ts, text, *, user="U0FAIZ", thread_ts=None, **extra):
    event = {
        "type": "message",
        "channel": channel,
        "channel_type": "channel",
        "user": user,
        "text": text,
        "ts": ts,
        "event_ts": ts,
        **extra,
    }
    if thread_ts:
        event["thread_ts"] = thread_ts
    return event


def envelope(event, *, team="T0ACME", shared=False):
    return {
        "token": "unused",
        "team_id": team,
        "api_app_id": APP,
        "event": event,
        "type": "event_callback",
        "event_id": f"Ev{next(_ids):08d}",
        "event_time": int(time.time()),
        "is_ext_shared_channel": shared,
        "authorizations": [{"team_id": team, "user_id": "U0BOT", "is_bot": True}],
    }


def headers_for(body, *, retry=None, secret=SIGNING, at=None):
    stamp, signature = sign(body, secret=secret, at=at)
    out = {"X-Slack-Request-Timestamp": stamp, "X-Slack-Signature": signature}
    if retry:
        out.update({"X-Slack-Retry-Num": str(retry), "X-Slack-Retry-Reason": "http_timeout"})
    return out


def post(client, payload, *, retry=None, secret=SIGNING, at=None, raw=None):
    """POST one signed delivery through Django's test client."""
    body = raw if raw is not None else json.dumps(payload).encode()
    extra = {
        f"HTTP_{k.upper().replace('-', '_')}": v
        for k, v in headers_for(body, retry=retry, secret=secret, at=at).items()
    }
    return client.post(URL, data=body, content_type="application/json", **extra)
