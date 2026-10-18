"""The nightly checks, in thread mode (agent bundles D2 contract §2.3,
D2-11, D2-12, D2-27): a message bundle's step may quote its thread, and
never applies on its own; the nightly pass never expires or replaces a
message bundle's step, or a step a person edited."""

import json
from unittest.mock import patch

from django.utils import timezone

from services.agents import evidence, run
from services.agents.kinds import Invalid
from services.agents.models import AgentBundle, AgentPolicy
from services.agents.policy import policy_for
from services.agents.registry import REGISTRY
from services.agents.run import RunResult, _consider
from services.agents.tests.bundle_fixtures import lifecycle, note
from services.agents.tests.intake_fixtures import IntakeFixture
from services.metrics.models import AgentAction


def item(kind, payload, ref, evidence, title="Log the login loop"):
    return {
        "kind": kind,
        "record": ref,
        "title": title,
        "rationale": "Customer is locked out.",
        "evidence": evidence,
        "payload": payload,
    }


class ThreadConsiderTests(IntakeFixture):
    def consider(self, ctx, entry, made):
        def make_bundle(title, rationale):
            made.append(
                AgentBundle.objects.create(
                    organisation=self.org,
                    agent="cs",
                    title=title,
                    reason=rationale,
                    source="thread",
                    customer=self.pizza,
                )
            )
            return made[-1]

        kept = {
            "keys": set(),
            "ids": set(),
            "builder": False,
            "bundles": {},
            "kinds": {},
            "seen": {},
            "placed": {},
            "make_bundle": make_bundle,
        }
        result = RunResult()
        _consider(
            self.org,
            "cs",
            entry,
            ctx,
            policy_for(self.org),
            "b",
            timezone.now(),
            None,
            kept,
            result,
        )
        return result

    def test_a_note_may_quote_its_thread_and_waits_even_on_auto(self):
        AgentPolicy.objects.update_or_create(
            organisation=self.org, defaults={"levels": {"cs": {"note.create": "auto"}}}
        )
        _, thread = self.ticket_thread(self.pizza)
        ctx, _ = self.thread_ctx(thread)
        line = self.thread_line(ctx, "ticket ")
        made = []
        result = self.consider(
            ctx,
            item(
                "note.create",
                {"title": "Login loop after password reset", "body": "Customer locked out."},
                ctx.thread_ref,
                [line],
            ),
            made,
        )
        self.assertEqual((result.proposed, result.applied), (1, 0))
        step = AgentAction.objects.get(pk=result.created[0])
        self.assertEqual((step.status, step.bundle_id), ("proposed", made[0].pk))

    def test_the_same_note_on_the_nightly_pass_is_dropped(self):
        _, thread = self.ticket_thread(self.pizza)
        ctx, _ = self.thread_ctx(thread)
        line = self.thread_line(ctx, "ticket ")
        ctx.thread_ref = None  # as the nightly pass reads
        with self.assertRaisesMessage(Invalid, "only a draft reply cites mail or tickets"):
            self.consider(
                ctx,
                item(
                    "note.create",
                    {"title": "Login loop", "body": "Locked out."},
                    f"customer:{self.pizza.pk}",
                    [line],
                ),
                [],
            )

    def nightly(self, *items):
        with (
            patch("services.agents.policy.plan_credits", return_value=3000),
            patch("services.agents.run.get_completion", return_value=json.dumps(list(items))),
        ):
            return run.run(self.org, "cs")

    def test_the_nightly_pass_never_expires_a_message_step_or_an_edited_step(self):
        _, thread = self.ticket_thread(self.pizza)
        message = self.message_bundle(thread, note()).steps.get()
        edited = self.bundle_of(self.pizza, note("Edited", "By Carl")).steps.get()
        AgentAction.objects.filter(pk=edited.pk).update(edited_at=timezone.now())
        plain = self.bundle_of(self.pizza, note("Plain", "Body")).steps.get()
        self.nightly()
        statuses = dict(
            AgentAction.objects.filter(pk__in=[message.pk, edited.pk, plain.pk]).values_list(
                "pk", "status"
            )
        )
        self.assertEqual(
            (statuses[message.pk], statuses[edited.pk], statuses[plain.pk]),
            ("proposed", "proposed", "expired"),
        )

    def test_no_pass_replaces_an_edited_step_with_a_different_proposal(self):
        ctx = evidence.build(self.org, "cs", today=self.today)
        ref = f"customer:{self.pizza.pk}"
        line = next(x for x in sorted(evidence.record_lines(ctx, ref)) if x.startswith("- "))
        step = self.bundle_of(self.pizza, lifecycle("renewal")).steps.get()
        AgentAction.objects.filter(pk=step.pk).update(
            target=REGISTRY["record.lifecycle"].target({"stage": "renewal"}),
            edited_at=timezone.now(),
        )
        self.nightly(
            {
                "kind": "record.lifecycle",
                "record": ref,
                "title": "Move to onboarding",
                "rationale": "Renews soon.",
                "evidence": [line],
                "payload": {"stage": "onboarding"},
            }
        )
        step.refresh_from_db()
        self.assertEqual((step.status, step.payload["stage"]), ("proposed", "renewal"))
