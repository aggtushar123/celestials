"""Atlassian's OAuth 2.0 (3LO) token endpoint and accessible-resources in
memory (agent bundles round 2 D2), standing in for `jira_links.http_json`.
Refresh tokens rotate as Atlassian's do: each use issues a new one and the
used one stops working. Nothing leaves the process."""

import json
from urllib.parse import urlsplit

from services.connectors.providers.base import ProviderError

CLOUD = "11223344-a1b2-3b33-c444-def123456789"


class FakeAtlassian:
    def __init__(self):
        self.resources = [
            {
                "id": CLOUD,
                "url": "https://acme.atlassian.net",
                "name": "acme",
                "scopes": ["read:jira-work", "write:jira-work", "read:jira-user"],
            },
            {
                "id": "conf-1",
                "url": "https://acme.atlassian.net",
                "name": "acme",
                "scopes": ["read:confluence-content.all"],
            },
        ]
        self.me = {
            "accountId": "acc-carl",
            "displayName": "Carl Lee",
            "emailAddress": "carl@acme.io",
        }
        self.live_refresh = set()
        self.tokens_issued = 0
        self.refreshes = []
        self.calls = []
        self._refuse_refresh = False
        self._drop_refresh = False
        self.give_refresh_token = True

    def refuse_refresh(
        self, error="invalid_grant", description="Unknown or invalid refresh token."
    ):
        """The next refresh is refused with `error` (Atlassian also answers a
        dead refresh token with `unauthorized_client`, "refresh_token is invalid")."""
        self._refuse_refresh = (error, description)

    def drop_refresh(self):
        self._drop_refresh = True

    def _pair(self):
        self.tokens_issued += 1
        n = self.tokens_issued
        pair = {
            "access_token": f"at-{n}",
            "expires_in": 3600,
            "scope": "read:jira-work write:jira-work read:jira-user offline_access",
            "token_type": "Bearer",
        }
        if self.give_refresh_token:
            pair["refresh_token"] = f"rt-{n}"
            self.live_refresh.add(f"rt-{n}")
        return pair

    def __call__(self, method, url, *, headers=None, data=None, form=None, timeout=30, write=False):
        parts = urlsplit(url)
        self.calls.append(
            (method, parts.netloc + parts.path, json.loads(json.dumps(data)) if data else None)
        )
        if parts.netloc == "auth.atlassian.com" and parts.path == "/oauth/token":
            if data["grant_type"] == "authorization_code":
                if data["code"] != "good-code":
                    raise ProviderError(
                        "403 from auth.atlassian.com", status=403, body={"error": "invalid_grant"}
                    )
                return self._pair()
            self.refreshes.append(data["refresh_token"])
            if self._drop_refresh:
                self._drop_refresh = False
                raise ProviderError("auth.atlassian.com did not answer: TimeoutError")
            if self._refuse_refresh or data["refresh_token"] not in self.live_refresh:
                error, description = self._refuse_refresh or (
                    "invalid_grant",
                    "Unknown or invalid refresh token.",
                )
                self._refuse_refresh = False
                raise ProviderError(
                    "403 from auth.atlassian.com",
                    status=403,
                    body={"error": error, "error_description": description},
                )
            self.live_refresh.discard(data["refresh_token"])
            return self._pair()
        if parts.path == "/oauth/token/accessible-resources":
            return list(self.resources)
        if parts.path.endswith("/rest/api/3/myself"):
            return dict(self.me)
        raise AssertionError(f"FakeAtlassian has no route for {method} {url}")


def use_atlassian(testcase, fake=None):
    """`fake` (or a new FakeAtlassian) stands in for Atlassian for the rest of the test."""
    from unittest.mock import patch

    fake = fake or FakeAtlassian()
    patcher = patch("services.connectors.jira_links.http_json", fake)
    patcher.start()
    testcase.addCleanup(patcher.stop)
    return fake
