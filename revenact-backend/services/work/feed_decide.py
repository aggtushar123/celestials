"""The feed's decide group (Work in one place, spec §4.1): agent bundles
to open, rule reviews, questions and the reader's own reply drafts, oldest
first. Rule reviews and questions are Brain's desk sources (`brain.desk`)
on the reader's Me desk, reused unchanged; bundles are those holding a
waiting step on that desk, cut by the bundle read rule (Agent bundles
§10.1, §8); drafts are Communications › Drafts' list, on records the
reader may still open. `waiting - readable` is each source's `hidden`.

Each source is `Cls(reader)` with `count`, `hidden` and `page(after,
limit)`; a page's sort key is `(created_at, rank, id)`, so the four merge
into one order and one keyset cursor."""

from django.db.models import Q

from services.brain import desk
from services.brain.scope import ME, resolve
from services.customers.models import ReplyDraft
from services.customers.scoping import visible_accounts, visible_customers
from services.metrics.models import AgentAction

from .feed_shape import BUNDLE, DRAFT, QUESTION, RULE_REVIEW, after_q, item, record_ref

QUESTION_TITLE = 200
AGENTS = dict(AgentAction.Agent.choices)


def person(user):
    return {"id": user.pk, "name": user.name}


def draft_title(draft):
    if draft.channel == ReplyDraft.Channel.TICKET:
        return f"Reply on {draft.ticket.ticket_number}"
    return draft.subject or "Reply to an email"


class Source:
    kind = ""
    rank = 0
    related = ()

    def count(self):
        return self.readable.count()

    def hidden(self):
        return self.waiting.count() - self.count()

    def _after(self, rows, position):
        if position is None:
            return rows
        at, rank, pk = position
        if self.rank > rank:
            return rows.filter(created_at__gte=at)
        if self.rank < rank:
            return rows.filter(created_at__gt=at)
        return rows.filter(after_q(("created_at", "id"), (at, pk)))

    def page(self, after, limit):
        rows = self._after(self.readable, after).select_related(*self.related)
        objects = list(rows.order_by("created_at", "id")[:limit])
        return [
            ((row.created_at, self.rank, row.pk), entry)
            for row, entry in zip(objects, self.items(objects), strict=True)
        ]

    def items(self, objects):
        raise NotImplementedError


class RuleReviews(Source):
    kind, rank = RULE_REVIEW, 0
    related = ("rule__owner", "rule__segment", "rule__organisation", "run")

    def __init__(self, reader):
        self.reader = reader
        found = desk.rule_reviews(reader, resolve(reader, ME))
        self.waiting, self.readable = found.waiting, found.readable

    def items(self, reviews):
        from services.rules.payloads import review_campaign_names, review_payload

        names = review_campaign_names([r for r in reviews if r.rule.owner_id == self.reader.pk])
        out = []
        for review in reviews:
            # SOC2:AUTH-02 only the rule's owner decides its review, and only they read the review
            mine = review.rule.owner_id == self.reader.pk
            out.append(
                item(
                    key=f"rule_review:{review.pk}",
                    kind=RULE_REVIEW,
                    pk=review.pk,
                    title=f"{review.get_kind_display()} from {review.rule.name}",
                    record=None,
                    source={"type": "rule", "label": review.rule.name},
                    at=review.created_at,
                    actions=["approve", "skip"] if mine else [],
                    detail={
                        "rule_id": review.rule_id,
                        "rule_name": review.rule.name,
                        "review_kind": review.kind,
                        "counts": review.counts,
                        "review": review_payload(review, names) if mine else None,
                    },
                )
            )
        return out


def waiting_bundles(reader, steps):
    """The waiting bundles (inside their 14 days) holding any of `steps`;
    never a message bundle routed to a department or to admins, which waits
    only in that queue (agent bundles D2-8)."""
    from services.agents.bundles import live_waiting
    from services.agents.models import AgentBundle

    return live_waiting(
        AgentBundle.objects.filter(
            organisation_id=reader.organisation_id, id__in=steps.values("bundle_id")
        ).exclude(
            source=AgentBundle.Source.THREAD,
            routed_to__in=(AgentBundle.RoutedTo.DEPARTMENT, AgentBundle.RoutedTo.ADMINS),
        )
    )


def bundle_items(bundles, reader, extra=None):
    """FeedItems for `bundles` (a page), their steps read once for the page."""
    from services.agents import bulk
    from services.agents.bundle_payloads import item_detail, participant_only

    steps = {}
    rows = AgentAction.objects.filter(bundle_id__in=[b.pk for b in bundles]).select_related(
        "customer__owner", "account__owner", "organisation", "bundle"
    )
    for step in rows.order_by("bundle_id", "position"):
        steps.setdefault(step.bundle_id, []).append(step)
    every = [step for found in steps.values() for step in found]
    out = []
    # The rights' reads are done once for the page, not once per row.
    with bulk.using(every):
        only = participant_only(reader, bundles)
        for bundle in bundles:
            record = bundle.record
            joined = bundle.pk in only
            row = item(
                key=f"bundle:{bundle.pk}",
                kind=BUNDLE,
                pk=bundle.pk,
                title=bundle.title,
                # SE4-26: a participant who can't open the record gets no way in
                record=None if record is None else {**record_ref(record), "can_open": not joined},
                source={"type": "agent", "label": AGENTS.get(bundle.agent, "AI agent")},
                at=bundle.created_at,
                actions=["open"],
                detail=item_detail(bundle, reader, steps.get(bundle.pk, []), participant=joined),
            )
            out.append({**row, **(extra(bundle) if extra else {})})
    return out


class Bundles(Source):
    """Waiting bundles with a waiting step on the reader's Me desk (contract
    §10.1); `hidden` is those the bundle read rule (§8) removes."""

    kind, rank = BUNDLE, 1
    related = ("customer__owner", "account__owner", "thread")

    def __init__(self, reader):
        from services.agents.bundles import live_waiting, readable
        from services.agents.models import AgentBundle, BundleParticipant

        self.reader = reader
        self.sessions = desk.session_ids_seen_whole(reader)
        steps = desk.agent_actions(reader, resolve(reader, ME), self.sessions).waiting
        on_desk = waiting_bundles(reader, steps)
        # SE4-25: a bundle made from a Slack thread the reader took part in, whoever it is routed to
        joined = live_waiting(
            AgentBundle.objects.filter(
                organisation_id=reader.organisation_id,
                id__in=BundleParticipant.objects.filter(user=reader).values("bundle_id"),
            )
        )
        self.waiting = AgentBundle.objects.filter(
            Q(id__in=on_desk.values("id")) | Q(id__in=joined.values("id"))
        )
        # SOC2:AUTH-02 the bundle read rule (record openable, sources readable), or a participant's
        self.readable = readable(reader, self.waiting)

    def items(self, bundles):
        return bundle_items(bundles, self.reader)


class Questions(Source):
    kind, rank = QUESTION, 2
    related = ("assignee", "asked_by", "customer")

    def __init__(self, reader):
        self.reader = reader
        found = desk.questions(reader, resolve(reader, ME))
        self.waiting, self.readable = found.waiting, found.readable

    def items(self, questions):
        # SOC2:AUTH-02 QuestionAnswerView's rule: the person asked, or manage_users
        answers_any = self.reader.has_capability("manage_users")
        return [
            item(
                key=f"question:{q.pk}",
                kind=QUESTION,
                pk=q.pk,
                title=q.text[:QUESTION_TITLE],
                record=record_ref(q.customer) if q.customer_id else None,
                source={"type": "person", "label": q.asked_by.name},
                at=q.created_at,
                actions=["answer"] if q.assignee_id == self.reader.pk or answers_any else [],
                detail={"text": q.text, "asked_by": person(q.asked_by)},
            )
            for q in questions
        ]


class Drafts(Source):
    kind, rank = DRAFT, 3
    related = ("customer", "account", "ticket")

    def __init__(self, reader):
        self.reader = reader
        # The reader's own open drafts: Communications › Drafts' list.
        self.waiting = ReplyDraft.objects.filter(
            organisation_id=reader.organisation_id,
            owner_id=reader.pk,
            status=ReplyDraft.Status.OPEN,
        )
        # SOC2:AUTH-02 named only on a record the reader may still open; the rest counted
        self.readable = self.waiting.filter(
            Q(customer_id__in=visible_customers(reader).values("id"))
            | Q(account_id__in=visible_accounts(reader).values("id"))
        )

    def items(self, drafts):
        return [
            item(
                key=f"draft:{d.pk}",
                kind=DRAFT,
                pk=d.pk,
                title=draft_title(d),
                record=record_ref(d.record),
                source={"type": "agent", "label": AGENTS.get(d.agent, "AI agent")},
                at=d.created_at,
                actions=["open"],
                detail={"channel": d.channel},
            )
            for d in drafts
        ]


MAKERS = {RULE_REVIEW: RuleReviews, BUNDLE: Bundles, QUESTION: Questions, DRAFT: Drafts}
