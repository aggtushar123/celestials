"""The Team queue's decide group (Work in one place, delivery 2 contract
§1.4; Agent bundles §10.2): agent bundles, rule reviews and questions
waiting on the scope's people. Brain's desk sources at the scope, reused
unchanged, minus what waits on the reader's own Me desk, which My work
already shows (Decision D1); Rest of company also leaves out the reader's
own team (Agent bundles D7). Each row says who it waits on (`for`).

What a row offers: a bundle is opened (its steps are decided in the
bundle); a rule review only to its rule's owner (never the reader here, so
always read-only); a question to its assignee or a `manage_users` reader."""

from services.brain import desk
from services.brain.scope import ME, resolve

from . import feed_decide
from .feed_shape import BUNDLE, QUESTION, RULE_REVIEW
from .team_scope import named, near, owned_by_q


def _with_for(objects, rows, owner_of):
    return [{**row, "for": named(owner_of(obj))} for obj, row in zip(objects, rows, strict=True)]


class TeamReviews(feed_decide.RuleReviews):
    def __init__(self, reader, scope):
        self.reader = reader
        found = desk.rule_reviews(reader, scope)
        left_out = near(reader, scope)
        # The reader's own rules' reviews wait on their My work (Decision D1);
        # Rest of company leaves out their team's too (D7).
        self.waiting = found.waiting.exclude(rule__owner_id__in=left_out)
        self.readable = found.readable.exclude(rule__owner_id__in=left_out)

    def items(self, reviews):
        return _with_for(reviews, super().items(reviews), lambda review: review.rule.owner)


def owner_of(bundle):
    record = bundle.record
    return None if record is None else record.owner


def bundle_rows(bundles, reader):
    """FeedItems for `bundles`, each saying who it waits on (`for`): the
    team feed's and the department queues' shared shape."""
    return feed_decide.bundle_items(bundles, reader, lambda b: {"for": named(owner_of(b))})


class TeamBundles(feed_decide.Bundles):
    """Waiting bundles with a waiting step on the scope's desk, less those on
    the reader's Me desk; Rest of company also less My team's (D7)."""

    def __init__(self, reader, scope):
        from services.agents.bundles import readable
        from services.agents.models import BundleParticipant

        self.reader = reader
        self.sessions = desk.session_ids_seen_whole(reader)
        steps = desk.agent_actions(reader, scope, self.sessions).waiting
        mine = desk.agent_actions(reader, resolve(reader, ME), self.sessions).waiting
        # Decision D1 (Work in one place): what is on the reader's Me desk stays on Mine.
        found = feed_decide.waiting_bundles(reader, steps).exclude(id__in=mine.values("bundle_id"))
        # SE4-25: a bundle of a thread the reader took part in is on Mine too.
        found = found.exclude(
            id__in=BundleParticipant.objects.filter(user=reader).values("bundle_id")
        )
        if scope.is_company:
            # D7: Rest of company holds nothing that is in My team.
            found = found.exclude(owned_by_q(reader.organisation_id, near(reader, scope)))
        self.waiting = found
        # SOC2:AUTH-02 the bundle read rule (record openable, sources readable)
        self.readable = readable(reader, found)

    def items(self, bundles):
        return bundle_rows(bundles, self.reader)


class TeamQuestions(feed_decide.Questions):
    def __init__(self, reader, scope):
        self.reader = reader
        found = desk.questions(reader, scope)
        left_out = near(reader, scope)
        # Questions asked of the reader are on their My work (Decision D1);
        # Rest of company leaves out their team's too (D7).
        self.waiting = found.waiting.exclude(assignee_id__in=left_out)
        self.readable = found.readable.exclude(assignee_id__in=left_out)

    def items(self, questions):
        return _with_for(questions, super().items(questions), lambda q: q.assignee)


MAKERS = {RULE_REVIEW: TeamReviews, BUNDLE: TeamBundles, QUESTION: TeamQuestions}
