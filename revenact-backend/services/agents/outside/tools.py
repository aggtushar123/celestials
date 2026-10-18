"""The outside tools a step talks to (agent bundles D3 contract §3): one
small surface over the runner's mailbox (`services.mail.agent_send`), Slack
and Jira (the ticket connectors' providers), so the kinds never know a
vendor and tests swap in fakes (`services/agents/tests/outside_fakes.py`).
Every write either answers, or raises Refused (nothing happened; a plain
sentence) or Unconfirmed (it may have happened: the next Retry looks
first). The pick lists raise ListFailed with the route's code and status."""

from contextlib import contextmanager
from dataclasses import asdict, dataclass

from services.connectors.providers.base import NoAnswer, ProviderError

from . import sentences


class Refused(Exception):
    def __init__(self, sentence):
        super().__init__(sentence)
        self.sentence = sentence


class Unconfirmed(Exception):
    def __init__(self, sentence):
        super().__init__(sentence)
        self.sentence = sentence


class ListFailed(Exception):
    def __init__(self, code, detail, status):
        super().__init__(detail)
        self.code, self.detail, self.status = code, detail, status


class CantCreateProject(Refused):
    """Jira refused the seat's account a new project (401/403)."""


class ProjectTaken(Refused):
    """Jira refused the new project's key or name (`field`): already in use."""

    def __init__(self, sentence, field):
        super().__init__(sentence)
        self.field = field


@dataclass(frozen=True)
class Mailed:
    email_id: int | None
    message_id: int | None
    provider_id: str
    threaded: bool
    address: str
    provider: str


@dataclass(frozen=True)
class Posted:
    ts: str
    url: str
    channel: str
    #: Posted with the runner's own Slack token (their SlackLink), not the bot's.
    person: bool = False


@dataclass(frozen=True)
class Issue:
    key: str
    url: str


@dataclass(frozen=True)
class Comment:
    id: str
    key: str
    url: str
    issue_url: str


class MailTool:
    def send(self, connection, *, source, to, cc, subject, body, key):
        from services.mail import agent_send

        try:
            sent = agent_send.send(
                connection, source=source, to=to, cc=cc, subject=subject, body=body, key=key
            )
        except agent_send.Unconfirmed as exc:
            raise Unconfirmed(exc.sentence) from None
        except agent_send.Refused as exc:
            raise Refused(exc.sentence) from None
        return Mailed(**asdict(sent))

    def find(self, connection, *, key, since, source=None):
        from services.mail import agent_send

        try:
            found = agent_send.find(connection, key=key, since=since, source=source)
        except agent_send.Refused as exc:
            raise Refused(exc.sentence) from None
        return None if found is None else Mailed(**asdict(found))

    def send_draft(self, connection, *, draft, actor):
        """Send `actor`'s own Gmail draft through the draft send path (guided
        agent: `mail.send_draft`). Its claim keeps a draft from going twice:
        an unanswered send leaves it `sending` for its owner to check."""
        from types import SimpleNamespace

        from rest_framework.response import Response

        from services.mail import draft_send
        from services.mail import drafts as mail_drafts

        # What the send path reads of a request: who sends, and no headers.
        request = SimpleNamespace(user=actor, META={})
        sent = draft_send.send_open(request, mail_drafts.readable(actor, draft.pk))
        if isinstance(sent, Response):
            data = sent.data if isinstance(sent.data, dict) else {}
            detail = data.get("detail")
            if not detail:
                first = next(iter(data.values()), "")
                detail = first[0] if isinstance(first, list) and first else str(first)
            if data.get("code") == "SEND_UNCONFIRMED":
                raise Unconfirmed(str(detail))
            raise Refused(str(detail) or draft_send.MAILBOX_REFUSED)
        email = sent.email
        return Mailed(
            email_id=email.pk if email is not None else None,
            message_id=sent.row.pk,
            provider_id=sent.row.provider_message_id,
            threaded=False,
            address=connection.address,
            provider=connection.provider,
        )


class SlackTool:
    #: A person's token that can't post in this channel: the bot posts instead.
    PERSON_CANT_POST = ("not_in_channel", "channel_not_found", "restricted_action")

    def shared(self, connector, *, channel, actor=None):
        """SE4-19: True or False for `channel` (asked as `actor` when linked,
        else the connection's bot), None when Slack can't say."""
        from services.connectors import slack_links
        from services.connectors.providers.slack import SlackProvider

        provider = SlackProvider()
        token = slack_links.person_token(slack_links.link_of(actor), connector)
        for creds in ([{"bot_token": token}] if token else []) + [connector.get_credentials()]:
            try:
                return provider.channel_shared(creds, channel)
            except ProviderError:
                continue
        return None

    def post(
        self, connector, *, channel, channel_name, text, thread_ts, key, actor=None, mentions=()
    ):
        """Post as `actor` when they linked their Slack account in this
        connection's Slack workspace (Connections spec §3 "post as me"),
        else as the connection's bot. A revoked person's token marks the
        link lost and the bot posts; the key rides in the metadata either way."""
        from services.connectors import slack_links
        from services.connectors.providers.slack import SlackProvider, message_url

        provider = SlackProvider()
        link = slack_links.link_of(actor)
        token = slack_links.person_token(link, connector)
        try:
            if token:
                try:
                    ts = provider.post_message(
                        # The header takes any token: here the person's own.
                        {"bot_token": token},
                        channel=channel,
                        text=text,
                        thread_ts=thread_ts,
                        key=key,
                        mentions=mentions,
                    )
                    return Posted(
                        ts=ts,
                        url=message_url(channel, ts, thread_ts),
                        channel=channel,
                        person=True,
                    )
                except NoAnswer:
                    raise
                except ProviderError as exc:
                    if exc.reauth:
                        slack_links.lose(link, exc.code or "reauth")
                    elif exc.code not in self.PERSON_CANT_POST:
                        raise
            ts = provider.post_message(
                connector.get_credentials(),
                channel=channel,
                text=text,
                thread_ts=thread_ts,
                key=key,
                mentions=mentions,
            )
        except NoAnswer:
            raise Unconfirmed(sentences.SLACK_UNCONFIRMED) from None
        except ProviderError as exc:
            raise Refused(sentences.slack(exc, channel_name)) from None
        return Posted(ts=ts, url=message_url(channel, ts, thread_ts), channel=channel)

    def find(self, connector, *, channel, channel_name, key, thread_ts, since):
        from services.connectors.providers.slack import SlackProvider, message_url

        try:
            ts = SlackProvider().find_message(
                connector.get_credentials(),
                channel=channel,
                key=key,
                thread_ts=thread_ts,
                oldest=f"{since.timestamp():.6f}",
            )
        except ProviderError as exc:
            raise Refused(sentences.slack(exc, channel_name)) from None
        return (
            None
            if ts is None
            else Posted(ts=ts, url=message_url(channel, ts, thread_ts), channel=channel)
        )


class JiraTool:
    """Every call acts from `seat` (round 2 D2 contract §3.1): the runner's
    own Jira link, or None for the connection's account. Links to issues and
    comments always name the site's host (`connector.config`)."""

    @staticmethod
    def _jira():
        from services.connectors.providers.jira import JiraProvider

        return JiraProvider()

    @staticmethod
    def _seat(connector, seat):
        from services.connectors.jira_links import connection_seat

        return seat or connection_seat(connector)

    def create(self, connector, *, fields, project, seat=None):
        from services.connectors.providers.jira import issue_url

        s = self._seat(connector, seat)
        try:
            key = self._jira().create_issue(s.config, s.creds, fields=fields)
        except NoAnswer:
            raise Unconfirmed(sentences.JIRA_CREATE_UNCONFIRMED) from None
        except ProviderError as exc:
            raise Refused(sentences.jira(exc, project=project, person=s.person)) from None
        return Issue(key=key, url=issue_url(connector.config, key))

    def find(self, connector, *, label, project, seat=None):
        from services.connectors.providers.jira import issue_url

        s = self._seat(connector, seat)
        try:
            key = self._jira().find_issue(s.config, s.creds, label=label)
        except ProviderError as exc:
            raise Refused(sentences.jira(exc, project=project, person=s.person)) from None
        return None if key is None else Issue(key=key, url=issue_url(connector.config, key))

    def assign(self, connector, *, issue, account_id, assignee_name, seat=None):
        from services.connectors.providers.jira import issue_url

        s = self._seat(connector, seat)
        try:
            self._jira().assign_issue(s.config, s.creds, issue, account_id)
        except NoAnswer:
            raise Unconfirmed(sentences.JIRA_ASSIGN_UNCONFIRMED) from None
        except ProviderError as exc:
            raise Refused(
                sentences.jira(exc, issue=issue, assignee=assignee_name, person=s.person)
            ) from None
        return Issue(key=issue, url=issue_url(connector.config, issue))

    def remote_link(self, connector, *, issue, url, title, global_id, seat=None):
        """SE4-8: link the issue back to its Slack thread. Raises Refused for any
        failure, an unanswered call included: the caller only notes it."""
        s = self._seat(connector, seat)
        try:
            self._jira().add_remote_link(
                s.config, s.creds, issue, url=url, title=title, global_id=global_id
            )
        except ProviderError as exc:  # NoAnswer is one
            raise Refused(sentences.jira(exc, issue=issue, person=s.person)) from None

    def _comment(self, connector, issue, comment_id):
        from services.connectors.providers.jira import comment_url, issue_url

        return Comment(
            id=comment_id,
            key=issue,
            url=comment_url(connector.config, issue, comment_id),
            issue_url=issue_url(connector.config, issue),
        )

    def comment(self, connector, *, issue, body, seat=None):
        s = self._seat(connector, seat)
        try:
            comment_id = self._jira().add_comment(s.config, s.creds, issue, body=body)
        except NoAnswer:
            raise Unconfirmed(sentences.JIRA_COMMENT_UNCONFIRMED) from None
        except ProviderError as exc:
            raise Refused(sentences.jira(exc, issue=issue, person=s.person)) from None
        return self._comment(connector, issue, comment_id)

    def find_comment(self, connector, *, issue, marker, seat=None):
        s = self._seat(connector, seat)
        try:
            comment_id = self._jira().find_comment(s.config, s.creds, issue, marker=marker)
        except ProviderError as exc:
            raise Refused(sentences.jira(exc, issue=issue, person=s.person)) from None
        return None if comment_id is None else self._comment(connector, issue, comment_id)

    def assignee(self, connector, *, issue, seat=None):
        s = self._seat(connector, seat)
        try:
            return self._jira().issue_assignee(s.config, s.creds, issue)
        except ProviderError as exc:
            raise Refused(sentences.jira(exc, issue=issue, person=s.person)) from None

    def status(self, connector, *, issue, seat=None):
        """Slack bundles (`issue_waits.poll`): the issue's status as a ticket's
        (`open`, `in-progress`, `resolved`), or None when Jira has no such
        issue (404). Raises Refused for any other failure."""
        s = self._seat(connector, seat)
        try:
            return self._jira().issue_status(s.config, s.creds, issue)
        except ProviderError as exc:
            if exc.status == 404:
                return None
            raise Refused(sentences.jira(exc, issue=issue, person=s.person)) from None

    def account_for(self, connector, *, email, seat=None):
        s = self._seat(connector, seat)
        try:
            user = self._jira().user_by_email(s.config, s.creds, email)
        except ProviderError as exc:
            raise Refused(sentences.jira(exc, person=s.person)) from None
        return (
            None if user is None else {"id": user["accountId"], "name": user.get("displayName", "")}
        )

    def issue_types(self, connector, project, seat=None):
        s = self._seat(connector, seat)
        try:
            return self._jira().issue_types(s.config, s.creds, project)
        except ProviderError as exc:
            raise Refused(sentences.jira(exc, project=project, person=s.person)) from None

    def priorities(self, connector, *, project, issue_type, seat=None):
        """The priorities `project`'s create screen offers for `issue_type`:
        what a person's link may read (`read:jira-work`), per priority scheme."""
        s = self._seat(connector, seat)
        try:
            return self._jira().create_priorities(s.config, s.creds, project, issue_type)
        except ProviderError as exc:
            raise Refused(sentences.jira(exc, project=project, person=s.person)) from None

    def can_create_projects(self, connector, *, seat=None):
        """Whether the seat may create a Jira project: a person's link needs
        the project scope; the account needs Jira's Administer. True when
        Jira can't say (its refusal then answers the create)."""
        from .jira_projects import link_scoped

        s = self._seat(connector, seat)
        if not link_scoped(s):
            return False
        try:
            return self._jira().can_administer(s.config, s.creds)
        except ProviderError:
            return True

    def key_free(self, connector, *, key, seat=None):
        """Whether `key` is free for a new project; True when Jira can't say."""
        s = self._seat(connector, seat)
        try:
            return self._jira().project_key_free(s.config, s.creds, key)
        except ProviderError:
            return True

    def create_project(self, connector, *, key, name, seat=None):
        """A Jira Software project led by the seat's own account: its key.
        Raises CantCreateProject (401/403), ProjectTaken (Jira's 400 on the
        key or name), Unconfirmed or Refused."""
        from .jira_projects import CANT_CREATE

        s = self._seat(connector, seat)
        jira = self._jira()
        try:
            lead = str(jira.myself(s.config, s.creds).get("accountId") or "")
            return jira.create_project(s.config, s.creds, key=key, name=name, lead=lead)
        except NoAnswer:
            raise Unconfirmed(sentences.JIRA_PROJECT_UNCONFIRMED) from None
        except ProviderError as exc:
            if exc.status in (401, 403):
                raise CantCreateProject(CANT_CREATE) from None
            body = exc.body if isinstance(exc.body, dict) else {}
            errors = body.get("errors") if isinstance(body.get("errors"), dict) else {}
            if exc.status == 400 and "projectKey" in errors:
                raise ProjectTaken(sentences.PROJECT_KEY_TAKEN, "key") from None
            if exc.status == 400 and "projectName" in errors:
                raise ProjectTaken(sentences.PROJECT_NAME_TAKEN, "name") from None
            raise Refused(sentences.jira(exc, project=key, person=s.person)) from None

    def options(self, connector, name, *, project="", issue="", query="", issue_type="", seat=None):
        """A pick list (contract §5.2): (rows, more). Raises ListFailed."""
        s = self._seat(connector, seat)
        jira, config, creds = self._jira(), s.config, s.creds
        try:
            if name == "jira_projects":
                return jira.projects(config, creds, query)
            if name == "jira_issue_types":
                return jira.issue_types(config, creds, project), False
            if name == "jira_priorities":
                if project and issue_type:
                    return jira.create_priorities(config, creds, project, issue_type), False
                # `/priority/search` needs an admin scope a person's link lacks.
                if s.person:
                    return jira.site_priorities(config, creds), False
                return jira.priorities(config, creds), False
            return jira.assignable(config, creds, project=project, issue=issue, query=query), False
        except ProviderError as exc:
            raise ListFailed(
                *sentences.list_failure(exc, project=project, issue=issue, person=s.person)
            ) from None


@dataclass
class Tools:
    mail: object
    slack: object
    jira: object


_current = Tools(MailTool(), SlackTool(), JiraTool())


def current():
    return _current


@contextmanager
def using(tools):
    """`tools` stand in for the real ones until the block ends (tests, the e2e journey)."""
    global _current
    was, _current = _current, tools
    try:
        yield tools
    finally:
        _current = was
