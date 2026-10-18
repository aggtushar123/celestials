"""Reads for a page of actions, done once (Activity): the tasks, people,
attribute names and latest attribute values the kinds' previews and
`current` would each look up per row. A kind asks `active()` and falls back
to its own query when no page is being written."""

from contextlib import contextmanager
from contextvars import ContextVar

from django.db.models import Exists, OuterRef, Q

_active = ContextVar("agent_action_bulk", default=None)
MISSING = object()


def active():
    return _active.get()


def ids(values):
    """The whole numbers among `values` (never a bool)."""
    return {v for v in values if isinstance(v, int) and not isinstance(v, bool)}


class Bulk:
    def __init__(self, actions, users=()):
        from services.accounts.models import User
        from services.attributes.models import AIAttribute, AIAttributeValue
        from services.customers.models import ReplyDraft, Task, Ticket

        actions = list(actions)
        #: SE4-25: the page's bundles, and per reader the ones they took part in
        self.bundle_ids = {a.bundle_id for a in actions if a.bundle_id}
        self._participating = {}
        #: a jira.create step's project choice per (step, reader) (outside.jira_projects)
        self.jira_choices = {}
        self._visible = {}
        self.draft_action_ids = {a.pk for a in actions if a.kind == "draft.reply"}
        self._unreadable = {}
        organisation_ids = {a.organisation_id for a in actions}
        customer_ids = {a.customer_id for a in actions if a.customer_id}
        account_ids = {a.account_id for a in actions if a.account_id}
        # SE4-12: `users` are the page's escalation handlers, read with the steps' people.
        task_ids, user_ids, attribute_ids, pairs = set(), set(users), set(), set()
        email_ids, ticket_ids, draft_ids = set(), set(), set()
        for action in actions:
            payload = action.payload if isinstance(action.payload, dict) else {}
            if payload.get("task_id") is not None:
                task_ids.add(payload["task_id"])
            if action.kind == "task.reassign":
                user_ids.update((payload.get("assignee_id"), action.before))
            if action.kind in ("jira.create", "jira.assign"):
                user_ids.add(payload.get("assignee_member_id"))
            if action.kind == "record.owner":
                user_ids.update((payload.get("owner_id"), action.before))
            if action.kind == "record.attribute" and payload.get("attribute_id") is not None:
                attribute_ids.add(payload["attribute_id"])
                if action.status == "applied":
                    kind = "account" if action.account_id else "customer"
                    pairs.add(
                        (payload["attribute_id"], kind, action.account_id or action.customer_id)
                    )
            if action.kind == "draft.reply":
                email_ids.add(payload.get("email_id"))
                ticket_ids.add(payload.get("ticket_id"))
                result = action.result if isinstance(action.result, dict) else {}
                draft_ids.add(result.get("draft_id"))
        # Agent bundles D3: the page's outside steps' connectors, one query.
        from services.connectors.models import Connector

        self.outside_ids = {
            a.pk
            for a in actions
            if a.kind in ("slack.reply", "jira.create", "jira.assign", "jira.comment")
        }
        wanted = set()
        for action in actions:
            if action.pk in self.outside_ids and isinstance(action.payload, dict):
                wanted |= ids(
                    [action.payload.get("connector_id"), action.payload.get("source_connector_id")]
                )
        self.connectors = (
            {
                c.pk: c
                for c in Connector.objects.filter(
                    pk__in=wanted, organisation_id__in=organisation_ids
                )
            }
            if wanted
            else {}
        )
        self._mailboxes = {}
        self._jira_links = {}
        self._slack_links = {}
        # Only what the page's own records and workspace own, as the single-row reads do.
        self.tasks = {
            t.pk: t
            for t in Task.objects.select_related("assignee").filter(
                Q(customer_id__in=customer_ids) | Q(account_id__in=account_ids),
                pk__in=ids(task_ids),
            )
        }
        people = User.objects.filter(
            pk__in=ids(user_ids), organisation_id__in=organisation_ids
        ).values_list("id", "name", "function")
        self.names, self.functions = {}, {}
        for pk, name, function in people:
            self.names[pk], self.functions[pk] = name, function
        self.attributes = dict(
            AIAttribute.objects.filter(
                pk__in=ids(attribute_ids), organisation_id__in=organisation_ids
            ).values_list("id", "name")
        )
        # The newest value of each (attribute, record) pair, not its history.
        self.latest = {}
        for kind in ("customer", "account"):
            wanted = {(attr, rec) for attr, k, rec in pairs if k == kind}
            if not wanted:
                continue
            newer = AIAttributeValue.objects.filter(
                attribute_id=OuterRef("attribute_id"),
                **{kind: OuterRef(kind)},
            ).filter(
                Q(computed_at__gt=OuterRef("computed_at"))
                | Q(computed_at=OuterRef("computed_at"), id__gt=OuterRef("id"))
            )
            rows = AIAttributeValue.objects.filter(
                attribute_id__in={attr for attr, _ in wanted},
                **{f"{kind}_id__in": {rec for _, rec in wanted}},
            ).filter(~Exists(newer))
            for row in rows:
                key = (row.attribute_id, kind, getattr(row, f"{kind}_id"))
                if (key[0], key[2]) in wanted:
                    self.latest[key] = row
        # A draft reply's thread head, its ticket's status and its draft, each one
        # query and only when the page holds a draft reply. A gone row reads None.
        self.heads = self._heads(ids(email_ids))
        self.ticket_status = dict.fromkeys(ids(ticket_ids))
        if self.ticket_status:
            self.ticket_status.update(
                Ticket.objects.filter(pk__in=list(self.ticket_status)).values_list("id", "status")
            )
        self.drafts = dict.fromkeys(ids(draft_ids))
        if self.drafts:
            self.drafts.update(
                {row.pk: row for row in ReplyDraft.objects.filter(pk__in=list(self.drafts))}
            )
        # Every segment.create on the page: counted once per reader (`member_count`).
        self.definitions = {
            a.pk: a.payload
            for a in actions
            if a.kind == "segment.create" and isinstance(a.payload, dict)
        }
        self._members = {}
        # Every canvas.create's record: its people counted once per reader.
        self.maps = {}
        for action in actions:
            if action.kind == "canvas.create":
                from .people import ref_of

                self.maps[action.pk] = ref_of(action)
        self._people = {}

    @staticmethod
    def _heads(email_ids):
        """{email id: the newest email in its thread for its mailbox owner}."""
        if not email_ids:
            return {}
        from django.db.models import Subquery

        from services.customers.models import Email

        newest = (
            Email.objects.filter(
                mailbox_owner_id=OuterRef("mailbox_owner_id"), thread_id=OuterRef("thread_id")
            )
            .order_by("-sent_at", "-id")
            .values("id")[:1]
        )
        heads = dict.fromkeys(email_ids)
        heads.update(
            Email.objects.filter(pk__in=list(email_ids))
            .annotate(head=Subquery(newest))
            .values_list("id", "head")
        )
        return heads

    def mailbox(self, user):
        """`user`'s own mailbox, one query per reader (D3: a reply's gate and preview)."""
        if user.pk not in self._mailboxes:
            from services.mail.models import MailboxConnection

            self._mailboxes[user.pk] = MailboxConnection.objects.filter(user=user).first()
        return self._mailboxes[user.pk]

    def jira_link(self, user):
        """`user`'s own Jira link or None, one query per reader (round 2 D2)."""
        if user.pk not in self._jira_links:
            from services.connectors.models import JiraLink

            # SOC2:AUTH-02 a person acts only through their own link
            self._jira_links[user.pk] = JiraLink.objects.filter(user=user).first()
        return self._jira_links[user.pk]

    def slack_link(self, user):
        """`user`'s own Slack link or None, one query per reader (SE4-15)."""
        if user.pk not in self._slack_links:
            from services.connectors.models import SlackLink

            # SOC2:AUTH-02 a person posts only through their own link
            self._slack_links[user.pk] = SlackLink.objects.filter(user=user).first()
        return self._slack_links[user.pk]

    def participating(self, user):
        """SE4-25: the page's bundles `user` took part in the thread of, one query per reader."""
        if user.pk not in self._participating:
            from .models import BundleParticipant

            self._participating[user.pk] = (
                set(
                    BundleParticipant.objects.filter(
                        user=user, bundle_id__in=sorted(self.bundle_ids)
                    ).values_list("bundle_id", flat=True)
                )
                if self.bundle_ids
                else set()
            )
        return self._participating[user.pk]

    def visible_task_ids(self, reader):
        """The page's tasks `reader` may read: one query per reader, not per row."""
        from services.customers.models import Task
        from services.customers.personal import visible_tasks

        if reader.pk not in self._visible:
            # SOC2:AUTH-02 a task's title only for someone who may read the task
            self._visible[reader.pk] = (
                set(
                    visible_tasks(reader, Task.objects.filter(id__in=list(self.tasks))).values_list(
                        "id", flat=True
                    )
                )
                if self.tasks
                else set()
            )
        return self._visible[reader.pk]

    def unreadable_drafts(self, reader):
        """The page's draft replies `reader` may not read: one query per reader."""
        if reader.pk not in self._unreadable:
            from .source_access import unreadable_draft_ids

            self._unreadable[reader.pk] = (
                set(
                    unreadable_draft_ids(reader)
                    .filter(id__in=sorted(self.draft_action_ids))
                    .values_list("id", flat=True)
                )
                if self.draft_action_ids
                else set()
            )
        return self._unreadable[reader.pk]

    def member_count(self, reader, action_id):
        """`action_id`'s segment's member count for `reader`, or None when it
        is not a segment.create on this page."""
        if action_id not in self.definitions:
            return None
        if reader.pk not in self._members:
            from django.utils import timezone

            from .builder import member_counts

            ids = sorted(self.definitions)
            counts = member_counts(
                reader, [self.definitions[pk] for pk in ids], today=timezone.localdate()
            )
            self._members[reader.pk] = dict(zip(ids, counts, strict=True))
        return self._members[reader.pk][action_id]

    def people_count(self, reader, action_id):
        """How many of `action_id`'s record's people `reader` may open, or
        None when it is not a canvas.create on this page."""
        if action_id not in self.maps:
            return None
        if reader.pk not in self._people:
            from .people import visible_people

            self._people[reader.pk] = visible_people(reader, sorted(set(self.maps.values())))
        return self._people[reader.pk][self.maps[action_id]]

    def latest_value(self, attribute_id, kind, record_id):
        return self.latest.get((attribute_id, kind, record_id))


@contextmanager
def using(actions, users=()):
    token = _active.set(Bulk(actions, users))
    try:
        yield
    finally:
        _active.reset(token)
