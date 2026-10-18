"""What customers are saying: BrainFixture's people and book, plus makers
for feature requests and their asks, anomalies and their reports, survey
sends and answers, and contacts.

Carl (CSM) owns Pizza Hut, Dough Co, Pizza EMEA and Taco East (under Dana's
Taco Bell) and reports to Mona, who owns Soup Co. Dana owns Taco Bell and
Taco West. Loose Ltd is nobody's. Alice sees everything; Lee reads Company
through Leadership only, so the only customer he can open is Loose Ltd."""

from datetime import timedelta
from itertools import count

from django.utils import timezone

from services.accounts.models import User
from services.anomalies.models import Anomaly, AnomalyEvidence
from services.brain.scope import resolve
from services.brain.tests.fixtures import BrainFixture
from services.customers.models import Account, Contact
from services.requests.models import FeatureRequest, RequestEvidence
from services.surveys.models import LINK_DAYS, SurveyInvite, SurveySend
from services.surveys.tokens import new_token

#: Source record ids: a filing is unique per (kind, record_id).
_ids = count(1)


def parent(record):
    return {"account": record} if isinstance(record, Account) else {"customer": record}


class CustomersFixture(BrainFixture):
    def reader_and_scope(self, user, key):
        """A fresh reader (no memoised org chart) and their scope."""
        reader = User.objects.get(pk=user.pk)
        return reader, resolve(reader, key)

    def feature(self, title, *records, status="open"):
        made = FeatureRequest.objects.create(
            organisation=self.org, title=title, summary="", status=status
        )
        for record in records:
            self.ask(made, record)
        return made

    def ask(self, feature, record, *, days_ago=1, kind="call", **fields):
        return RequestEvidence.objects.create(
            request=feature,
            organisation=self.org,
            kind=kind,
            record_id=next(_ids),
            snippet="We need this.",
            occurred_at=timezone.now() - timedelta(days=days_ago),
            **parent(record),
            **fields,
        )

    def anomaly(self, title, *records, status="live"):
        now = timezone.now()
        made = Anomaly.objects.create(
            organisation=self.org,
            title=title,
            summary="What the model wrote.",
            status=status,
            first_seen_at=now - timedelta(days=3),
            last_seen_at=now,
        )
        for record in records:
            self.report(made, record)
        return made

    def report(self, anomaly, record, *, kind="call", **fields):
        return AnomalyEvidence.objects.create(
            anomaly=anomaly,
            organisation=self.org,
            kind=kind,
            record_id=next(_ids),
            snippet="It broke.",
            occurred_at=timezone.now() - timedelta(days=1),
            **parent(record),
            **fields,
        )

    def send(self, survey_type="nps", *, owner=None, sharing="workspace"):
        return SurveySend.objects.create(
            organisation=self.org,
            owner=owner or self.admin,
            name="Pulse",
            survey_type=survey_type,
            subject="A quick question",
            status="sent",
            sharing=sharing,
        )

    def answer(self, send, record, score, *, days_ago=1, comment=""):
        now = timezone.now()
        return SurveyInvite.objects.create(
            send=send,
            email=f"person{next(_ids)}@example.com",
            token_hash=new_token()[1],
            expires_at=now + timedelta(days=LINK_DAYS),
            status="answered",
            score=score,
            comment=comment,
            answered_at=now - timedelta(days=days_ago),
            **parent(record),
        )

    def answers(self, send, record, scores, *, days_ago=1):
        return [self.answer(send, record, score, days_ago=days_ago) for score in scores]

    def contact(self, record, name, sentiment="neutral", **fields):
        return Contact.objects.create(
            name=name,
            email=f"{name.split()[0].lower()}{next(_ids)}@example.com",
            sentiment=sentiment,
            **parent(record),
            **fields,
        )

    def turned(self, contact, was, *, days_ago=1):
        """`contact` is now negative and was `was`, as of `days_ago`, set
        row by row (the change itself is Task 1's, tested there)."""
        Contact.objects.filter(pk=contact.pk).update(
            sentiment="negative",
            previous_sentiment=was,
            sentiment_changed_at=timezone.now() - timedelta(days=days_ago),
        )
