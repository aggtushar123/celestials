"""The recommender's tests' world: BrainFixture's people and book. Carl owns
Pizza Hut, Dough Co, Pizza EMEA and Taco East and reports to Mona; Dana owns
Taco Bell and Taco West and has no manager; Alice is an admin with
view_all_accounts (Leadership); Lee is Leadership without it; Soup Co is
Mona's; Loose Ltd has no owner; Gus is Globex's. Dough Co and Taco Bell
renew in 30 days; nothing else renews.

`make_rec` writes a recommendation directly. `only(kind, **params)` turns
every source off but one; `prefer(**fields)` sets other Work settings;
`signals(kind, **params)` reads one source; `refresh_now()` is one refresh."""

from datetime import timedelta

from django.utils import timezone

from services.accounts.models import Organisation, User
from services.brain.tests.fixtures import BrainFixture
from services.customers.models import Customer
from services.metrics.models import AgentAction
from services.work.models import DEFAULT_SOURCES, Recommendation, WorkSettings
from services.work.prefs import settings_for


def record_link(record):
    kind = "organizations" if isinstance(record, Customer) else "accounts"
    return f"/{kind}/{record.pk}"


def task_proposal(
    organisation,
    customer,
    *,
    assignee_name="Carl CSM",
    due_in=10,
    priority="high",
    status=AgentAction.Status.PROPOSED,
    title="Call the exec sponsor",
):
    """A task proposal from the AI agent, as `metrics.proposals` stores one."""
    return AgentAction.objects.create(
        organisation=organisation,
        batch="b1",
        kind=AgentAction.Kind.TASK_CREATE,
        customer=customer,
        target=f"task:{title.casefold()}",
        title=title,
        rationale="Written from the whole workspace's figures.",
        evidence=["Pizza Hut: USD 100,000 ARR, renews in 30 days"],
        status=status,
        payload={
            "title": title,
            "assignee_id": None,
            "assignee_name": assignee_name,
            "due_date": (timezone.localdate() + timedelta(days=due_in)).isoformat(),
            "priority": priority,
        },
    )


class RecommendFixture(BrainFixture):
    @classmethod
    def make_rec(
        cls,
        kind="renewal_due",
        *,
        on,
        recipient,
        suggested=None,
        status="open",
        value=None,
        title=None,
        facts=("Renews in 30 days",),
        agent_action=None,
        decided_by=None,
        decided_at=None,
        task=None,
    ):
        if isinstance(on, Customer):
            customer, account = on, None
        else:
            customer, account = on.customers.order_by("id").first(), on
        return Recommendation.objects.create(
            organisation=cls.org,
            customer=customer,
            account=account,
            kind=kind,
            title=title or f"Prepare {on.name}'s renewal",
            why={
                "facts": list(facts),
                "evidence": [{"label": on.name, "link": record_link(on)}],
            },
            suggested_assignee=suggested,
            recipient=recipient,
            status=status,
            signal_value=value,
            agent_action=agent_action,
            decided_by=decided_by,
            decided_at=decided_at,
            task=task,
        )

    def only(self, kind, **params):
        """Every source off but `kind`, with `params` over its defaults."""
        sources = {
            name: {**values, "enabled": name == kind} for name, values in DEFAULT_SOURCES.items()
        }
        sources[kind].update(params)
        WorkSettings.objects.filter(pk=settings_for(self.org).pk).update(sources=sources)

    def prefer(self, **fields):
        WorkSettings.objects.filter(pk=settings_for(self.org).pk).update(**fields)

    def signals(self, kind, *, today=None, now=None, **params):
        from services.work.sources import SOURCES, load_book

        book = load_book(
            Organisation.objects.get(pk=self.org.pk),
            today=today or self.today,
            now=now or timezone.now(),
        )
        return SOURCES[kind](book, {**DEFAULT_SOURCES[kind], **params})

    def refresh_now(self, *, today=None, now=None):
        """One refresh. Not `run`: that shadows `unittest.TestCase.run` and
        crashes every test in the class (see services/rules/tests/
        test_reading.py and test_review_kinds.py for the same gotcha)."""
        from services.work.recommend import refresh

        return refresh(Organisation.objects.get(pk=self.org.pk), today=today or self.today, now=now)

    def recs(self, **filters):
        return Recommendation.objects.filter(organisation=self.org, **filters)

    def client_for(self, user):
        """A client for a fresh copy of `user` (no memoised org chart)."""
        return self.as_user(User.objects.get(pk=user.pk))

    def get(self, user, url):
        return self.client_for(user).get(url)

    def ok(self, user, url):
        response = self.get(user, url)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def post(self, user, url, body=None):
        return self.client_for(user).post(url, body if body is not None else {}, format="json")

    def patch(self, user, url, body):
        return self.client_for(user).patch(url, body, format="json")
