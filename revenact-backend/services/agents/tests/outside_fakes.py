"""In-memory stand-ins for the outside facade (agent bundles D3): the
runner's mailbox, Slack and Jira. Each keeps what it was asked to do, can
refuse or lose the answer of its next write, refuse its next lookup, and
finds a write by its key.
`use_fakes(testcase)` installs them for the rest of the test. Nothing is
ever sent."""

from services.agents.outside import sentences, tools
from services.connectors.providers.jira import adf_text


class FakeMail:
    def __init__(self):
        self.sent, self.lookups = [], []
        self._refuse, self._drop, self._refuse_find = None, False, None

    def refuse_next(self, sentence):
        self._refuse = sentence

    def refuse_find(self, sentence):
        self._refuse_find = sentence

    def drop_next(self):
        self._drop = True

    def _made(self, connection, n, threaded=False):
        return tools.Mailed(
            email_id=None,
            message_id=900 + n,
            provider_id=f"fake-{n}",
            threaded=threaded,
            address=connection.address,
            provider=connection.provider,
        )

    def send(self, connection, *, source, to, cc, subject, body, key):
        if self._refuse:
            sentence, self._refuse = self._refuse, None
            raise tools.Refused(sentence)
        self.sent.append(
            {
                "mailbox": connection.pk,
                "source": source.pk,
                "to": list(to),
                "cc": list(cc),
                "subject": subject,
                "body": body,
                "key": key,
            }
        )
        made = self._made(connection, len(self.sent), threaded=source.mailbox_id == connection.pk)
        if self._drop:
            self._drop = False
            raise tools.Unconfirmed(sentences.MAIL_UNCONFIRMED)
        return made

    def send_draft(self, connection, *, draft, actor):
        """The guided agent's send: the draft is marked sent and filed on its
        record in the owner's mailbox, as the draft send path does."""
        from django.utils import timezone

        from services.customers.models import Email
        from services.mail.models import MailDraft

        if self._refuse:
            sentence, self._refuse = self._refuse, None
            raise tools.Refused(sentence)
        self.sent.append(
            {
                "mailbox": connection.pk,
                "draft": draft.pk,
                "source": None,
                "to": [address for _, address in draft.to],
                "cc": [],
                "subject": draft.subject,
                "body": draft.text,
                "key": "",
            }
        )
        n = len(self.sent)
        if self._drop:
            self._drop = False
            MailDraft.objects.filter(pk=draft.pk).update(status=MailDraft.Status.SENDING)
            raise tools.Unconfirmed(sentences.MAIL_UNCONFIRMED)
        email = Email.objects.create(
            customer_id=draft.customer_id,
            account_id=draft.account_id,
            subject=draft.subject,
            sender_name=actor.name,
            recipient_name=draft.to[0][0] if draft.to else "",
            body=draft.text,
            sent_at=timezone.now(),
            mailbox=connection,
            mailbox_owner=actor,
            direction=Email.Direction.SENT,
            from_address=connection.address,
            to_addresses=[address for _, address in draft.to],
            provider_message_id=f"fake-draft-{n}",
            synced_at=timezone.now(),
        )
        MailDraft.objects.filter(pk=draft.pk).update(
            status=MailDraft.Status.SENT, sent_at=timezone.now(), sent_email=email
        )
        return tools.Mailed(
            email_id=email.pk,
            message_id=None,
            provider_id=f"fake-draft-{n}",
            threaded=False,
            address=connection.address,
            provider=connection.provider,
        )

    def find(self, connection, *, key, since, source=None):
        if self._refuse_find:
            sentence, self._refuse_find = self._refuse_find, None
            raise tools.Refused(sentence)
        self.lookups.append(key)
        for n, row in enumerate(self.sent, start=1):
            if row["key"] == key and row["mailbox"] == connection.pk:
                return self._made(connection, n)
        return None


class FakeSlack:
    def __init__(self):
        self.posts, self.lookups, self.looked_in = [], [], []
        self.shared_channels, self.shared_asked, self.cant_say = set(), [], False
        self._refuse, self._drop, self._refuse_find = None, False, None

    def refuse_next(self, sentence):
        self._refuse = sentence

    def refuse_find(self, sentence):
        self._refuse_find = sentence

    def drop_next(self):
        self._drop = True

    def shared(self, connector, *, channel, actor=None):
        self.shared_asked.append(channel)
        return None if self.cant_say else channel in self.shared_channels

    def post(
        self, connector, *, channel, channel_name, text, thread_ts, key, actor=None, mentions=()
    ):
        if self._refuse:
            sentence, self._refuse = self._refuse, None
            raise tools.Refused(sentence)
        ts = f"{1760340000 + len(self.posts) + 1}.000100"
        self.posts.append(
            {
                "connector": connector.pk,
                "channel": channel,
                "text": text,
                "thread_ts": thread_ts,
                "key": key,
                "mentions": set(mentions),
                "ts": ts,
                "actor": getattr(actor, "pk", None),
            }
        )
        posted = tools.Posted(
            ts=ts,
            url=f"https://slack.com/archives/{channel}/p{ts.replace('.', '')}",
            channel=channel,
        )
        if self._drop:
            self._drop = False
            raise tools.Unconfirmed(sentences.SLACK_UNCONFIRMED)
        return posted

    def find(self, connector, *, channel, channel_name, key, thread_ts, since):
        if self._refuse_find:
            sentence, self._refuse_find = self._refuse_find, None
            raise tools.Refused(sentence)
        self.lookups.append(key)
        self.looked_in.append((channel, thread_ts))
        for row in self.posts:
            if row["key"] == key and (row["channel"], row["thread_ts"]) == (channel, thread_ts):
                return tools.Posted(
                    ts=row["ts"],
                    url=f"https://slack.com/archives/{channel}/p{row['ts'].replace('.', '')}",
                    channel=channel,
                )
        return None


class FakeJira:
    def __init__(self):
        self.issues = {"SUP-12": {"fields": {}, "assignee": None}}
        self.created, self.assigned, self.lookups = [], [], []
        self.user_lookups = []
        self.priority_reads = []  # (project, issue type id) per create-screen read
        self.comments, self.comment_lookups = [], []
        self._comment_id = 20000
        self.remote_links = []  # (issue, url, title, global id) per remote link
        self.statuses, self.status_reads = {}, []  # issue -> "open" | "resolved" | None
        self.users = {
            "priya@acme.io": {"id": "acc-priya", "name": "Priya Shah"},
            "erin@acme.io": {"id": "acc-erin", "name": "Erin Eng"},
        }
        self.types = {
            "SUP": [
                {"id": "10001", "name": "Task", "detail": ""},
                {"id": "10002", "name": "Bug", "detail": ""},
            ]
        }
        self.priority_rows = [
            {"id": "2", "name": "High", "detail": ""},
            {"id": "3", "name": "Medium", "detail": ""},
            {"id": "4", "name": "Low", "detail": ""},
        ]
        #: Jira's projects the seat sees (the projects list); made ones join it.
        self.project_rows = [
            {"id": "SUP", "name": "Support", "detail": "SUP"},
            {"id": "ENG", "name": "Engineering", "detail": "ENG"},
        ]
        self.may_create_projects = True
        self.taken_keys = set()  # keys Jira has for projects the seat can't see
        self.made_projects = []  # (key, name) per project made
        self.project_refusal = None  # an exception the next create_project raises
        self.project_reads = 0
        self._refuse, self._drop, self._lists = {}, set(), None
        self._next = 100
        self.seats = []  # the seat each call acted from (None: the connection's)

    def refuse_next(self, op, sentence):
        """The next `op` ("create", "assign", "assignee", "find", "comment",
        "find_comment", "remote_link") is refused."""
        self._refuse[op] = sentence

    def drop_next(self, op):
        self._drop.add(op)

    def fail_lists(self, code, detail, status):
        self._lists = tools.ListFailed(code, detail, status)

    def _refused(self, op):
        if op in self._refuse:
            raise tools.Refused(self._refuse.pop(op))

    def _url(self, connector, key):
        return f"https://{connector.config['host']}/browse/{key}"

    def create(self, connector, *, fields, project, seat=None):
        self.seats.append(seat)
        self._refused("create")
        self._next += 1
        key = f"{project}-{self._next}"
        self.issues[key] = {
            "fields": fields,
            "assignee": (fields.get("assignee") or {}).get("accountId"),
        }
        self.created.append(key)
        if "create" in self._drop:
            self._drop.discard("create")
            raise tools.Unconfirmed(sentences.JIRA_CREATE_UNCONFIRMED)
        return tools.Issue(key=key, url=self._url(connector, key))

    def remote_link(self, connector, *, issue, url, title, global_id, seat=None):
        self.seats.append(seat)
        self._refused("remote_link")
        self.remote_links.append((issue, url, title, global_id))

    def find(self, connector, *, label, project, seat=None):
        self.seats.append(seat)
        self._refused("find")
        self.lookups.append(label)
        for key, issue in self.issues.items():
            if label in issue["fields"].get("labels", []):
                return tools.Issue(key=key, url=self._url(connector, key))
        return None

    def assign(self, connector, *, issue, account_id, assignee_name, seat=None):
        self.seats.append(seat)
        self._refused("assign")
        self.issues.setdefault(issue, {"fields": {}, "assignee": None})["assignee"] = account_id
        self.assigned.append((issue, account_id))
        if "assign" in self._drop:
            self._drop.discard("assign")
            raise tools.Unconfirmed(sentences.JIRA_ASSIGN_UNCONFIRMED)
        return tools.Issue(key=issue, url=self._url(connector, issue))

    def _comment_of(self, connector, issue, comment_id):
        return tools.Comment(
            id=comment_id,
            key=issue,
            url=f"{self._url(connector, issue)}?focusedCommentId={comment_id}",
            issue_url=self._url(connector, issue),
        )

    def comment(self, connector, *, issue, body, seat=None):
        self.seats.append(seat)
        self._refused("comment")
        self._comment_id += 1
        comment_id = str(self._comment_id)
        self.comments.append({"issue": issue, "id": comment_id, "text": adf_text(body)})
        if "comment" in self._drop:
            self._drop.discard("comment")
            raise tools.Unconfirmed(sentences.JIRA_COMMENT_UNCONFIRMED)
        return self._comment_of(connector, issue, comment_id)

    def find_comment(self, connector, *, issue, marker, seat=None):
        self.seats.append(seat)
        self._refused("find_comment")
        self.comment_lookups.append((issue, marker))
        for row in reversed(self.comments):
            if row["issue"] == issue and f"{marker}." in row["text"]:
                return self._comment_of(connector, issue, row["id"])
        return None

    def assignee(self, connector, *, issue, seat=None):
        self.seats.append(seat)
        self._refused("assignee")
        return (self.issues.get(issue) or {}).get("assignee")

    def status(self, connector, *, issue, seat=None):
        """An issue's status (Slack bundles' poll): `statuses[issue]`, "open"
        for a known issue, None for one Jira doesn't have."""
        self.seats.append(seat)
        self._refused("status")
        self.status_reads.append(issue)
        if issue in self.statuses:
            return self.statuses[issue]
        return "open" if issue in self.issues else None

    def account_for(self, connector, *, email, seat=None):
        self.seats.append(seat)
        self.user_lookups.append(email)
        return self.users.get(email)

    def issue_types(self, connector, project, seat=None):
        self.seats.append(seat)
        return list(self.types.get(project, []))

    def priorities(self, connector, *, project, issue_type, seat=None):
        """The create screen's priorities for (project, issue_type)."""
        self.seats.append(seat)
        self.priority_reads.append((project, issue_type))
        return list(self.priority_rows)

    def can_create_projects(self, connector, *, seat=None):
        self.seats.append(seat)
        return self.may_create_projects

    def key_free(self, connector, *, key, seat=None):
        self.seats.append(seat)
        return key not in self.taken_keys and all(r["id"] != key for r in self.project_rows)

    def create_project(self, connector, *, key, name, seat=None):
        self.seats.append(seat)
        if self.project_refusal is not None:
            refusal, self.project_refusal = self.project_refusal, None
            raise refusal
        if key in self.taken_keys or any(r["id"] == key for r in self.project_rows):
            raise tools.ProjectTaken(sentences.PROJECT_KEY_TAKEN, "key")
        self.made_projects.append((key, name))
        self.project_rows.append({"id": key, "name": name, "detail": key})
        self.types.setdefault(key, [{"id": "10001", "name": "Task", "detail": ""}])
        return key

    def options(self, connector, name, *, project="", issue="", query="", issue_type="", seat=None):
        self.seats.append(seat)
        if self._lists is not None:
            failed, self._lists = self._lists, None
            raise failed
        if name == "jira_projects":
            self.project_reads += 1
            words = query.lower()
            return [
                dict(row)
                for row in self.project_rows
                if words in row["id"].lower() or words in row["name"].lower()
            ], False
        if name == "jira_issue_types":
            return list(self.types.get(project, [])), False
        if name == "jira_priorities":
            return list(self.priority_rows), False
        words = query.lower()
        rows = [
            {"id": u["id"], "name": u["name"], "detail": email}
            for email, u in self.users.items()
            if words in u["name"].lower()
        ]
        return rows, False


def use_fakes(testcase):
    """FakeMail, FakeSlack and FakeJira stand in for the tools for the rest of the test."""
    from django.core.cache import cache

    # The Jira project reads kept a minute (outside.jira_projects) start empty.
    cache.clear()
    testcase.addCleanup(cache.clear)
    fakes = tools.Tools(FakeMail(), FakeSlack(), FakeJira())
    block = tools.using(fakes)
    block.__enter__()
    testcase.addCleanup(block.__exit__, None, None, None)
    return fakes
