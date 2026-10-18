"""The bundles' tests' world: AgentsFixture's people and book (Carl owns
Pizza Hut, Dough Co, Pizza EMEA and Taco East and reports to Mona; Dana owns
Taco Bell and Taco West; Mona owns Soup Co; Loose Ltd has no owner; Alice is
an admin with view-all; Lee is Leadership without it), plus makers for
steps and bundles stored as the nightly pass stores them."""

import itertools

from services.accounts.models import User
from services.agents.models import AgentBundle
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import Account
from services.metrics.models import AgentAction

BUNDLES = "/api/v1/agents/bundles/"
HISTORY = "/api/v1/agents/bundles/history/"
_targets = itertools.count(1)


def lifecycle(stage="renewal"):
    return ("record.lifecycle", {"stage": stage})


def note(title="Called the sponsor", body="They renew if support improves."):
    return ("note.create", {"title": title, "body": body})


class BundleFixture(AgentsFixture):
    def step(self, record, *, kind="record.lifecycle", payload=None, bundle=None, **fields):
        """One step on `record` (None: workspace-level), in `bundle` (None: a bundle of one)."""
        on = {}
        if record is not None:
            on = {"account" if isinstance(record, Account) else "customer": record}
        payload = payload if payload is not None else {"stage": "renewal"}
        before = record.lifecycle_stage if kind == "record.lifecycle" and record else None
        defaults = {
            "agent": "cs",
            "batch": "b",
            "kind": kind,
            "target": f"{kind}:{next(_targets)}",
            "title": f"{kind} on {getattr(record, 'name', 'the workspace')}",
            "rationale": "Renews soon.",
            "evidence": ["Renews in 30 days"],
            "payload": payload,
            "before": before,
        }
        if bundle is not None:
            defaults["bundle"] = bundle
            defaults["position"] = bundle.steps.count() + 1
        return AgentAction.objects.create(organisation=self.org, **on, **{**defaults, **fields})

    def bundle_of(self, record, *steps, agent="cs", title="Save Pizza Hut", **fields):
        """A waiting bundle on `record` holding `steps` ((kind, payload) pairs), in order."""
        from services.agents.bundles import routing_for

        routed_to, routed_user = routing_for(record)
        on = {}
        if record is not None:
            on = {"account" if isinstance(record, Account) else "customer": record}
        bundle = AgentBundle.objects.create(
            organisation=self.org,
            agent=agent,
            title=title,
            reason="Health fell and the renewal is close.",
            routed_to=routed_to,
            routed_user=routed_user,
            **on,
            **fields,
        )
        for kind, payload in steps:
            self.step(record, kind=kind, payload=payload, bundle=bundle, agent=agent)
        return bundle

    def fresh(self, user):
        return User.objects.get(pk=user.pk)

    def run_one(self, user, action, **fields):
        return run_one(self.client_for(user), action, **fields)


def run_one(client, action, **fields):
    """Run `action`'s bundle with only `action` ticked (and `fields` edited):
    what today's Approve did, through the bundle route."""
    steps = []
    for step in AgentAction.objects.filter(bundle_id=action.bundle_id, status="proposed").order_by(
        "position", "id"
    ):
        row = {"id": step.pk, "selected": step.pk == action.pk}
        if step.pk == action.pk and fields:
            row["fields"] = fields
        steps.append(row)
    return client.post(f"{BUNDLES}{action.bundle_id}/run/", {"steps": steps}, format="json")
