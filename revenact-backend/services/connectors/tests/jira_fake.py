"""Jira Cloud's REST API v3 in memory (agent bundles D3), standing in for the
Jira provider's `http_json`. It answers myself, mypermissions, project
search, create-meta issue types and a type's create screen, the priority list
and priority search, assignable and user search,
issue create, JQL search (by label), issue read and assign, comments posted and
listed, and can refuse or drop the next call matching a path. Nothing leaves the process."""

import json
import re
from urllib.parse import parse_qs, unquote, urlsplit

from services.connectors.providers.base import NoAnswer, ProviderError

#: What Jira Cloud answered live to a person's OAuth token on an endpoint
#: their classic scopes don't cover (`/priority/search`: manage:jira-configuration).
SCOPE_MISMATCH = {"code": 401, "message": "Unauthorized; scope does not match"}


class FakeJiraApi:
    def __init__(self, host="acme.atlassian.net"):
        self.host = host
        self.permissions = {"CREATE_ISSUES", "ASSIGN_ISSUES", "BROWSE_PROJECTS", "ADD_COMMENTS"}
        self.comments = {}
        self._comment_id = 10030
        self.projects = {"SUP": "Support", "ENG": "Engineering"}
        self.types = {
            "SUP": [
                {"id": "10001", "name": "Task", "subtask": False},
                {"id": "10002", "name": "Bug", "subtask": False},
                {"id": "10003", "name": "Sub-task", "subtask": True},
            ],
            "ENG": [{"id": "10002", "name": "Bug", "subtask": False}],
        }
        self.priority_list = [
            {"id": "2", "name": "High"},
            {"id": "3", "name": "Medium"},
            {"id": "4", "name": "Low"},
        ]
        #: The create screen's priorities per project (every type alike); a
        #: project missing here has no priority field on its create screen.
        self.create_priorities = {"SUP": list(self.priority_list), "ENG": list(self.priority_list)}
        self.users = [
            {
                "accountId": "acc-priya",
                "displayName": "Priya Shah",
                "emailAddress": "priya@acme.io",
                "active": True,
            },
            {
                "accountId": "acc-erin",
                "displayName": "Erin Eng",
                "emailAddress": "erin@acme.io",
                "active": True,
            },
            {
                "accountId": "acc-gone",
                "displayName": "Old Hand",
                "emailAddress": "",
                "active": False,
            },
        ]
        #: key -> {"fields": ..., "assignee": accountId or None}
        self.issues = {"SUP-12": {"fields": {"labels": []}, "assignee": None}}
        #: Raw issues a sync's `updated >= ...` search returns.
        self.synced = []
        self.created = []
        self.assigned = []
        #: (key, body) per remote link posted (Slack escalations D4, SE4-8)
        self.remote_links = []
        self.calls = []
        self.callers = []
        self.urls = []
        self._refuse = []
        self._drop = []
        self._next = 100

    def refuse_next(self, pattern, status, body=None):
        self._refuse.append((re.compile(pattern), status, body or {}))

    def drop_next(self, pattern):
        """The next call matching `pattern` is done, then its answer is lost."""
        self._drop.append(re.compile(pattern))

    def __call__(self, method, url, *, headers=None, data=None, form=None, timeout=30, write=False):
        auth = (headers or {}).get("Authorization", "")
        self.callers.append(auth if auth.startswith("Bearer ") else "basic")
        self.urls.append(url)
        parts = urlsplit(url)
        # A person's seat (round 2 D2): https://api.atlassian.com/ex/jira/<cloud>/rest/api/3/...
        path = re.sub(r"^/ex/jira/[^/]+", "", parts.path)
        query = {k: v[0] for k, v in parse_qs(parts.query).items()}
        self.calls.append((method, path, query, json.loads(json.dumps(data)) if data else None))
        if path.endswith("/priority/search") and auth.startswith("Bearer "):
            # As live: the classic person scopes don't reach the admin endpoint.
            raise ProviderError(
                f"401 from {self.host}", reauth=True, status=401, body=dict(SCOPE_MISMATCH)
            )
        for n, (pattern, status, body) in enumerate(self._refuse):
            if pattern.search(f"{method} {path}"):
                self._refuse.pop(n)
                raise ProviderError(
                    f"{status} from {self.host}",
                    reauth=status in (401, 403),
                    status=status,
                    body=body,
                )
        answer = self._route(method, path, query, data or {})
        for n, pattern in enumerate(self._drop):
            if pattern.search(f"{method} {path}"):
                self._drop.pop(n)
                raise NoAnswer(f"{self.host} did not answer")
        return answer

    def _not_found(self):
        return ProviderError(
            f"404 from {self.host}", status=404, body={"errorMessages": ["Not found"]}
        )

    def _route(self, method, path, query, data):
        api = "/rest/api/3"
        if path == f"{api}/myself":
            return {
                "accountId": "acc-bot",
                "displayName": "Jira Bot",
                "emailAddress": "bot@acme.io",
            }
        if path == f"{api}/mypermissions":
            asked = query.get("permissions", "").split(",")
            return {"permissions": {p: {"havePermission": p in self.permissions} for p in asked}}
        if path == f"{api}/projectvalidate/key":
            key = query.get("key", "")
            if key in self.projects:
                return {"errorMessages": [], "errors": {"projectKey": "In use."}}
            return {"errorMessages": [], "errors": {}}
        if path == f"{api}/project" and method == "POST":
            if data["key"] in self.projects:
                raise ProviderError(
                    "400",
                    status=400,
                    body={"errors": {"projectKey": f"Project '{data['key']}' uses this key."}},
                )
            self.projects[data["key"]] = data["name"]
            self.types[data["key"]] = [{"id": "10001", "name": "Task", "subtask": False}]
            return {"id": 10500, "key": data["key"], "self": f"https://{self.host}"}
        if path == f"{api}/project/search":
            words = query.get("query", "").lower()
            rows = [
                {"id": str(n), "key": k, "name": v}
                for n, (k, v) in enumerate(self.projects.items())
                if words in v.lower() or words in k.lower()
            ]
            return {"values": rows, "isLast": True}
        found = re.fullmatch(rf"{api}/issue/createmeta/([A-Z0-9_]+)/issuetypes", path)
        if found:
            if found.group(1) not in self.types:
                raise self._not_found()
            return {"issueTypes": self.types[found.group(1)], "isLast": True}
        screen = re.fullmatch(rf"{api}/issue/createmeta/([A-Z0-9_]+)/issuetypes/(\d+)", path)
        if screen:
            project, type_id = screen.groups()
            if type_id not in {t["id"] for t in self.types.get(project, [])}:
                raise self._not_found()
            fields = [{"fieldId": "summary", "key": "summary", "name": "Summary"}]
            if project in self.create_priorities:
                fields.append(
                    {
                        "fieldId": "priority",
                        "key": "priority",
                        "name": "Priority",
                        "allowedValues": self.create_priorities[project],
                    }
                )
            return {"fields": fields, "startAt": 0, "maxResults": 50, "total": len(fields)}
        if path == f"{api}/priority":
            # The deprecated site-wide list (read:jira-work).
            return [{"id": "1", "name": "Highest"}, *self.priority_list]
        if path == f"{api}/priority/search":
            return {"values": self.priority_list, "isLast": True}
        if path == f"{api}/user/assignable/search":
            words = query.get("query", "").lower()
            return [
                u
                for u in self.users
                if words in u["displayName"].lower() or words in u["emailAddress"]
            ]
        if path == f"{api}/user/search":
            wanted = query.get("query", "").lower()
            return [u for u in self.users if u["emailAddress"] == wanted]
        if path == f"{api}/issue" and method == "POST":
            fields = data["fields"]
            if fields["project"]["key"] not in self.projects:
                raise ProviderError(
                    "400", status=400, body={"errors": {"project": "valid project is required"}}
                )
            self._next += 1
            key = f"{fields['project']['key']}-{self._next}"
            self.issues[key] = {
                "fields": fields,
                "assignee": (fields.get("assignee") or {}).get("accountId"),
            }
            self.created.append(key)
            return {
                "id": str(self._next),
                "key": key,
                "self": f"https://{self.host}{api}/issue/{key}",
            }
        if path == f"{api}/search/jql":
            label = re.fullmatch(r'labels = "([^"]+)"', data.get("jql", ""))
            if not label:
                # A sync's search (`updated >= ...`): the issues the test put here.
                return {"issues": list(self.synced), "isLast": True}
            keys = [
                k
                for k, v in self.issues.items()
                if label and label.group(1) in v["fields"].get("labels", [])
            ]
            return {"issues": [{"key": k} for k in keys], "isLast": True}
        comment = re.fullmatch(rf"{api}/issue/([A-Z0-9_]+-\d+)/comment", path)
        if comment:
            key = comment.group(1)
            if key not in self.issues:
                raise self._not_found()
            rows = self.comments.setdefault(key, [])
            if method == "POST":
                self._comment_id += 1
                rows.append(
                    {
                        "id": str(self._comment_id),
                        "body": data["body"],
                        "properties": data.get("properties", []),
                    }
                )
                return {"id": str(self._comment_id), "body": data["body"]}
            newest = list(reversed(rows)) if query.get("orderBy") == "-created" else list(rows)
            page = newest[: int(query.get("maxResults", 50))]
            return {"comments": page, "total": len(rows), "maxResults": len(page)}
        remote = re.fullmatch(rf"{api}/issue/([A-Z0-9_]+-\d+)/remotelink", path)
        if remote and method == "POST":
            key = remote.group(1)
            if key not in self.issues:
                raise self._not_found()
            self.remote_links.append((key, data))
            return {
                "id": len(self.remote_links),
                "self": f"https://{self.host}{api}/issue/{key}/remotelink/1",
            }
        assignee = re.fullmatch(rf"{api}/issue/([A-Z0-9_]+-\d+)/assignee", path)
        if assignee and method == "PUT":
            key = assignee.group(1)
            if key not in self.issues:
                raise self._not_found()
            self.issues[key]["assignee"] = data.get("accountId")
            self.assigned.append((key, data.get("accountId")))
            return {}
        issue = re.fullmatch(rf"{api}/issue/([A-Z0-9_]+-\d+)", path)
        if issue and method == "GET":
            key = unquote(issue.group(1))
            if key not in self.issues:
                raise self._not_found()
            who = self.issues[key]["assignee"]
            # Slack bundles: its status category ("new", "indeterminate", "done").
            category = self.issues[key].get("category", "new")
            return {
                "key": key,
                "fields": {
                    "assignee": {"accountId": who} if who else None,
                    "status": {"name": category, "statusCategory": {"key": category}},
                },
            }
        raise AssertionError(f"FakeJiraApi has no route for {method} {path}")


def use_jira(testcase, fake=None):
    """`fake` (or a new FakeJiraApi) stands in for Jira for the rest of the test."""
    from unittest.mock import patch

    fake = fake or FakeJiraApi()
    patcher = patch("services.connectors.providers.jira.http_json", fake)
    patcher.start()
    testcase.addCleanup(patcher.stop)
    return fake
