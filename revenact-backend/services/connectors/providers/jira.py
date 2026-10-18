"""Jira Cloud over the REST API (v3), one project or a JQL of the admin's own."""

from datetime import timedelta
from urllib.parse import quote, urlencode

from django.conf import settings
from django.utils import timezone

from .base import (
    ProviderError,
    RemoteTicket,
    SetupField,
    TicketProvider,
    as_date,
    basic_auth,
    http_json,
    parse_datetime,
    tenant,
)

STATUS_CATEGORY = {"new": "open", "indeterminate": "in-progress", "done": "resolved"}
PRIORITY = {
    "highest": "critical",
    "blocker": "critical",
    "critical": "critical",
    "high": "high",
    "major": "high",
    "medium": "medium",
    "normal": "medium",
    "low": "low",
    "lowest": "low",
    "minor": "low",
    "trivial": "low",
}
FIELDS = (
    "summary,status,priority,assignee,reporter,created,updated,resolutiondate,description,labels"
)
FIRST_SYNC_DAYS = 90
PAGE = 100
MAX_PAGES = 10


def adf_text(node) -> str:
    """Flatten an Atlassian Document Format tree to plain text."""
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return "".join(adf_text(n) for n in node)
    text = node.get("text", "")
    children = adf_text(node.get("content", []))
    if node.get("type") in ("paragraph", "heading", "listItem", "codeBlock", "blockquote"):
        children += "\n"
    return text + children


#: An issue an agent step made carries its key as a label (D3-11): `revenact-b12-s41`.
LABEL_PREFIX = "revenact-"
API = "/rest/api/3"
#: Round 2 D1 (R2D1-3): every agent comment is internal in Jira Service
#: Management; a Jira Software project ignores the property.
COMMENT_PROPERTY = {"key": "sd.public.comment", "value": {"internal": True}}
#: How many of an issue's newest comments a Retry reads for its ref (R2D1-4).
LOOK_COMMENTS = 100
#: A create screen's fields are read 200 a page, at most this many pages.
CREATE_META_PAGES = 3
#: The template a project an agent's runner creates starts from (kanban).
PROJECT_TEMPLATE = "com.pyxis.greenhopper.jira:gh-simplified-kanban-classic"


def issue_url(config, key):
    return f"https://{config['host']}/browse/{key}"


def comment_url(config, key, comment_id):
    return f"https://{config['host']}/browse/{key}?focusedCommentId={comment_id}"


def adf(text, footer=""):
    """Plain text as Atlassian Document Format: a paragraph per blank-line
    block, a hard break per line, the footer as its own paragraph."""
    blocks = [b for b in (text or "").replace("\r\n", "\n").split("\n\n") if b.strip()]
    if footer:
        blocks.append(footer)
    content = []
    for block in blocks:
        parts = []
        for n, line in enumerate(block.strip().split("\n")):
            if n:
                parts.append({"type": "hardBreak"})
            if line:
                parts.append({"type": "text", "text": line})
        content.append({"type": "paragraph", "content": parts})
    return {"type": "doc", "version": 1, "content": content}


def _row(id_, name, detail=""):
    return {"id": str(id_), "name": str(name or "")[:255], "detail": str(detail or "")}


class JiraProvider(TicketProvider):
    key = "jira"
    label = "Jira Software"
    fields = [
        SetupField("site", "Jira site", placeholder="acme (from acme.atlassian.net)"),
        SetupField("email", "Atlassian account email"),
        SetupField("api_token", "API token", secret=True),
        SetupField("project", "Project key", placeholder="SUP", required=False),
    ]
    help = (
        "Create an API token at id.atlassian.com › Security. "
        "Leave the project blank to sync every issue you can see."
    )

    def _headers(self, creds):
        # Round 2 D2 (R2D2-5): a person's seat carries their OAuth access token.
        if creds.get("access_token"):
            return {"Authorization": f"Bearer {creds['access_token']}"}
        return basic_auth(creds["email"], creds["api_token"])

    def connect(self, form):
        host = tenant(form.get("site", ""), ".atlassian.net")
        email = (form.get("email") or "").strip()
        token = (form.get("api_token") or "").strip()
        project = (form.get("project") or "").strip().upper()
        if not email or not token:
            raise ProviderError("Account email and API token are required.")
        if project and not project.replace("_", "").isalnum():
            raise ProviderError("That does not look like a Jira project key.")
        creds = {"email": email, "api_token": token}
        me = http_json("GET", f"https://{host}/rest/api/3/myself", headers=self._headers(creds))
        if not me.get("accountId"):
            raise ProviderError("Jira did not recognise that email and token.")
        return {
            "host": host,
            "project": project,
            "account_name": (me.get("displayName") or "")[:150],
        }, creds

    def _url(self, config, path, params=None):
        query = f"?{urlencode(params)}" if params else ""
        base = config.get("api_base") or f"https://{config['host']}"
        return f"{base}{API}{path}{query}"

    def _read(self, config, creds, path, params=None):
        return http_json(
            "GET",
            self._url(config, path, params),
            headers=self._headers(creds),
            timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
        )

    def my_permissions(self, config, creds, names):
        params = {"permissions": ",".join(names)}
        if config.get("project"):
            params["projectKey"] = config["project"]
        page = self._read(config, creds, "/mypermissions", params)
        held = page.get("permissions") or {}
        return {name for name in names if (held.get(name) or {}).get("havePermission")}

    def projects(self, config, creds, query=""):
        page = self._read(config, creds, "/project/search", {"maxResults": 50, "query": query})
        rows = [_row(p["key"], p.get("name"), p["key"]) for p in page.get("values", [])]
        return rows, not page.get("isLast", True)

    def myself(self, config, creds):
        """The account the call acts as (`accountId`, `displayName`)."""
        return self._read(config, creds, "/myself")

    def can_administer(self, config, creds):
        """Whether the account holds Jira's global Administer permission, which
        creating a project through the REST API needs."""
        page = self._read(config, creds, "/mypermissions", {"permissions": "ADMINISTER"})
        return bool(((page.get("permissions") or {}).get("ADMINISTER") or {}).get("havePermission"))

    def project_key_free(self, config, creds, key):
        """Whether `key` is free for a new project (`/projectvalidate/key`
        answers its errors; none means free)."""
        found = self._read(config, creds, "/projectvalidate/key", {"key": key})
        return not (found.get("errors") or found.get("errorMessages"))

    def create_project(self, config, creds, *, key, name, lead):
        """A Jira Software (kanban) project led by `lead`; its key."""
        made = http_json(
            "POST",
            self._url(config, "/project"),
            headers=self._headers(creds),
            data={
                "key": key,
                "name": name,
                "projectTypeKey": "software",
                "projectTemplateKey": PROJECT_TEMPLATE,
                "leadAccountId": lead,
                "assigneeType": "UNASSIGNED",
            },
            timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
            write=True,
        )
        return str(made.get("key") or key)

    def issue_types(self, config, creds, project):
        page = self._read(
            config,
            creds,
            f"/issue/createmeta/{quote(project, safe='')}/issuetypes",
            {"maxResults": 50},
        )
        types = page.get("issueTypes") or page.get("values") or []
        return [_row(t["id"], t.get("name")) for t in types if not t.get("subtask")]

    def priorities(self, config, creds):
        """The site's priorities through `/priority/search`: its OAuth scope is
        the admin `manage:jira-configuration`, so the connection's API token
        only. A person's link reads `site_priorities` or `create_priorities`."""
        page = self._read(config, creds, "/priority/search", {"maxResults": 50})
        return [_row(p["id"], p.get("name")) for p in page.get("values", [])]

    def site_priorities(self, config, creds):
        """The site's priorities through `GET /priority` (deprecated, but the
        one site-wide list `read:jira-work` reads)."""
        rows = self._read(config, creds, "/priority")
        return [_row(p["id"], p.get("name")) for p in (rows if isinstance(rows, list) else [])]

    def create_priorities(self, config, creds, project, issue_type):
        """The priorities `project`'s create screen offers for `issue_type`
        (its priority scheme; `read:jira-work`); [] when the screen has no
        priority field."""
        path = (
            f"/issue/createmeta/{quote(project, safe='')}/issuetypes/{quote(issue_type, safe='')}"
        )
        start = 0
        for _ in range(CREATE_META_PAGES):
            page = self._read(config, creds, path, {"startAt": start, "maxResults": 200})
            fields = page.get("fields") or page.get("results") or []
            for f in fields:
                if f.get("fieldId") == "priority" or f.get("key") == "priority":
                    return [_row(v["id"], v.get("name")) for v in f.get("allowedValues") or []]
            start += len(fields)
            if not fields or start >= int(page.get("total") or 0):
                break
        return []

    def assignable(self, config, creds, *, project="", issue="", query=""):
        params = {"maxResults": 20, "query": query}
        params.update({"issueKey": issue} if issue else {"project": project})
        users = self._read(config, creds, "/user/assignable/search", params)
        return [
            _row(u["accountId"], u.get("displayName"), u.get("emailAddress") or "")
            for u in users
            if u.get("active", True)
        ]

    def user_by_email(self, config, creds, email):
        users = self._read(config, creds, "/user/search", {"query": email})
        wanted = (email or "").lower()
        return next(
            (
                u
                for u in users
                if (u.get("emailAddress") or "").lower() == wanted and u.get("active", True)
            ),
            None,
        )

    def create_issue(self, config, creds, *, fields):
        """The new issue's key; NoAnswer when the request went out and nothing came back."""
        made = http_json(
            "POST",
            self._url(config, "/issue"),
            headers=self._headers(creds),
            data={"fields": fields},
            timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
            write=True,
        )
        return str(made["key"])

    def find_issue(self, config, creds, *, label):
        page = http_json(
            "POST",
            self._url(config, "/search/jql"),
            headers=self._headers(creds),
            data={"jql": f'labels = "{label}"', "fields": ["summary"], "maxResults": 1},
            timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
        )
        issues = page.get("issues") or []
        return str(issues[0]["key"]) if issues else None

    def issue_assignee(self, config, creds, issue):
        found = self._read(config, creds, f"/issue/{quote(issue, safe='')}", {"fields": "assignee"})
        return ((found.get("fields") or {}).get("assignee") or {}).get("accountId")

    def issue_status(self, config, creds, issue):
        """The issue's status as a ticket's (`open`, `in-progress`, `resolved`),
        from its status category. A missing issue is the ProviderError's 404."""
        found = self._read(config, creds, f"/issue/{quote(issue, safe='')}", {"fields": "status"})
        status = (found.get("fields") or {}).get("status") or {}
        category = (status.get("statusCategory") or {}).get("key", "new")
        return STATUS_CATEGORY.get(category, "open")

    def assign_issue(self, config, creds, issue, account_id):
        http_json(
            "PUT",
            self._url(config, f"/issue/{quote(issue, safe='')}/assignee"),
            headers=self._headers(creds),
            data={"accountId": account_id},
            timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
            write=True,
        )

    def add_remote_link(self, config, creds, issue, *, url, title, global_id):
        """A link on the issue to `url` (Slack escalations D4, SE4-8). The same
        `global_id` again updates that link, so a Retry never adds a second."""
        http_json(
            "POST",
            self._url(config, f"/issue/{quote(issue, safe='')}/remotelink"),
            headers=self._headers(creds),
            data={"globalId": global_id, "object": {"url": url, "title": title}},
            timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
            write=True,
        )

    def add_comment(self, config, creds, issue, *, body):
        """The new comment's id (`body` is ADF); NoAnswer when the request went
        out and nothing came back."""
        made = http_json(
            "POST",
            self._url(config, f"/issue/{quote(issue, safe='')}/comment"),
            headers=self._headers(creds),
            data={"body": body, "properties": [COMMENT_PROPERTY]},
            timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
            write=True,
        )
        return str(made["id"])

    def find_comment(self, config, creds, issue, *, marker):
        """The id of the newest of the issue's last 100 comments whose text
        holds `marker` ("ref b12-s41") followed by the footer's closing
        period, so "ref b1-s2" never matches "ref b1-s20.", or None."""
        page = self._read(
            config,
            creds,
            f"/issue/{quote(issue, safe='')}/comment",
            {"orderBy": "-created", "maxResults": LOOK_COMMENTS},
        )
        wanted = f"{marker}."
        for comment in page.get("comments") or []:
            if wanted in adf_text(comment.get("body")):
                return str(comment["id"])
        return None

    def fetch_tickets(self, config, creds, cursor):
        host = config["host"]
        since = parse_datetime(cursor) or (timezone.now() - timedelta(days=FIRST_SYNC_DAYS))
        clauses = [f'updated >= "{since.strftime("%Y-%m-%d %H:%M")}"']
        if config.get("project"):
            clauses.insert(0, f'project = "{config["project"]}"')
        jql = " AND ".join(clauses) + " ORDER BY updated ASC"
        out, token, newest = [], None, since
        for _ in range(MAX_PAGES):
            body = {"jql": jql, "fields": FIELDS.split(","), "maxResults": PAGE}
            if token:
                body["nextPageToken"] = token
            page = http_json(
                "POST",
                f"https://{host}/rest/api/3/search/jql",
                headers=self._headers(creds),
                data=body,
            )
            for raw in page.get("issues", []):
                ticket = self._ticket(host, raw)
                out.append(ticket)
                updated = parse_datetime((raw.get("fields") or {}).get("updated"))
                if updated and updated > newest:
                    newest = updated
            token = page.get("nextPageToken")
            if page.get("isLast", True) or not token:
                break
        return out, newest.isoformat(), creds

    def _ticket(self, host, raw):
        f = raw.get("fields") or {}
        category = ((f.get("status") or {}).get("statusCategory") or {}).get("key", "new")
        status = STATUS_CATEGORY.get(category, "open")
        priority_name = ((f.get("priority") or {}).get("name") or "medium").lower()
        reporter = f.get("reporter") or {}
        assignee = f.get("assignee") or {}
        labels = f.get("labels") or []
        made_here = any(str(label).startswith(LABEL_PREFIX) for label in labels)
        extra = {"updated_at": f.get("updated") or ""}
        if made_here:
            extra["made_here"] = True
        return RemoteTicket(
            external_id=raw["key"],
            number=raw["key"],
            title=(f.get("summary") or "(no summary)")[:255],
            description=adf_text(f.get("description")).strip(),
            status=status,
            priority=PRIORITY.get(priority_name, "medium"),
            requester_email=(reporter.get("emailAddress") or "").lower(),
            requester_name=reporter.get("displayName") or "",
            assignee_name=assignee.get("displayName") or "",
            url=f"https://{host}/browse/{raw['key']}",
            opened_at=as_date(f.get("created")),
            resolved_at=as_date(f.get("resolutiondate")),
            extra=extra,
        )
