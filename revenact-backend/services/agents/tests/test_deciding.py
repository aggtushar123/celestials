"""Deciding an agent action (spec §1.4): who may, under a lock, once;
a stale or waited action expires instead of applying."""

import dataclasses
from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import User
from services.agents import deciding
from services.agents.kinds import Stale
from services.agents.models import AgentPolicy
from services.agents.policy import policy_for
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import Customer
from services.metrics.models import AgentAction, Feedback


class DecidingTests(AgentsFixture):
    def lifecycle(self, record=None, **fields):
        record = record or self.pizza
        return AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="record.lifecycle",
            customer=record,
            target="lifecycle",
            title="Move to renewal",
            rationale="r",
            payload={"stage": "renewal"},
            before=record.lifecycle_stage,
            **fields,
        )

    def owner_change(self):
        return AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="record.owner",
            customer=self.pizza,
            target="owner",
            title="Hand over",
            rationale="r",
            payload={"owner_id": self.mona.pk},
            before=self.pizza.owner_id,
        )

    def audited(self, name):
        return AuditEvent.objects.filter(action=name)

    def test_who_may_decide(self):
        action = self.lifecycle()
        self.assertEqual(deciding.decided_as(self.csm, action), deciding.OWNER)
        self.assertEqual(deciding.decided_as(self.mona, action), deciding.CHAIN)
        self.assertEqual(deciding.decided_as(self.admin, action), deciding.COMPANY)
        self.assertIsNone(deciding.decided_as(self.other, action))
        self.assertIsNone(deciding.decided_as(self.lee, action))

    def test_a_workspace_level_action_is_view_all_only(self):
        action = AgentAction.objects.create(
            organisation=self.org,
            agent="ops",
            batch="b",
            kind="initiative.create",
            target="initiative:nrr::",
            title="t",
            rationale="r",
            payload={},
        )
        self.assertEqual(deciding.decided_as(self.admin, action), deciding.COMPANY)
        self.assertIsNone(deciding.decided_as(self.csm, action))

    def test_approve_applies_once_and_records_feedback(self):
        action = self.lifecycle()
        applied, role = deciding.approve(self.csm, action.pk, note="Yes")
        self.assertEqual((applied.status, role), ("applied", deciding.OWNER))
        self.assertEqual(applied.decided_by, self.csm)
        self.assertFalse(applied.auto)
        self.assertEqual(applied.after, "renewal")
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.lifecycle_stage, "renewal")
        self.assertTrue(Feedback.objects.filter(subject_id=action.pk).exists())
        with self.assertRaises(deciding.AlreadyDecided):
            deciding.approve(self.mona, action.pk)

    def test_reject(self):
        action = self.lifecycle()
        rejected, _ = deciding.reject(self.mona, action.pk, note="Not yet")
        self.assertEqual((rejected.status, rejected.decision_note), ("rejected", "Not yet"))
        self.pizza.refresh_from_db()
        self.assertNotEqual(self.pizza.lifecycle_stage, "renewal")

    def test_cant_decide(self):
        action = self.lifecycle()
        with self.assertRaises(deciding.CantDecide):
            deciding.approve(self.other, action.pk)

    def test_a_record_that_moved_on_expires_the_action(self):
        action = self.lifecycle()
        Customer.objects.filter(pk=self.pizza.pk).update(lifecycle_stage="churn")
        with self.assertRaises(deciding.Expired) as caught:
            deciding.approve(self.csm, action.pk)
        self.assertEqual(caught.exception.action.expired_reason, "changed")
        self.assertEqual(AgentAction.objects.get(pk=action.pk).status, "expired")

    def test_an_action_waiting_14_days_expires(self):
        action = self.lifecycle()
        AgentAction.objects.filter(pk=action.pk).update(
            created_at=timezone.now() - timedelta(days=15)
        )
        with self.assertRaises(deciding.Expired) as caught:
            deciding.approve(self.csm, action.pk)
        self.assertEqual(caught.exception.action.expired_reason, "waited")

    def test_a_kind_set_to_never_expires_on_decision(self):
        action = self.lifecycle()
        AgentPolicy.objects.filter(pk=policy_for(self.org).pk).update(
            levels={"cs": {"record.lifecycle": "never"}}
        )
        with self.assertRaises(deciding.Expired) as caught:
            deciding.approve(self.csm, action.pk)
        self.assertEqual(caught.exception.action.expired_reason, "never")

    def test_auto_apply_has_no_decider(self):
        action = self.lifecycle()
        deciding.apply_action(action, None, auto=True)
        action.refresh_from_db()
        self.assertEqual((action.status, action.auto, action.decided_by), ("applied", True, None))
        self.assertFalse(Feedback.objects.filter(subject_id=action.pk).exists())

    def test_approving_an_owner_change_needs_the_right_to_change_owners(self):
        # Lee decides as a view-all reader, who is neither above Carl nor
        # holds manage_org_settings: her own PATCH of the owner would be
        # refused, so is approving the agent's.
        action = self.owner_change()
        only_view_all = lambda user, capability: capability == "view_all_accounts"  # noqa: E731
        with patch.object(User, "has_capability", only_view_all):
            self.assertEqual(deciding.decided_as(self.lee, action), deciding.COMPANY)
            with self.assertRaises(deciding.CantDecide):
                deciding.approve(self.lee, action.pk)
        self.assertEqual(AgentAction.objects.get(pk=action.pk).status, "proposed")
        # the record's owner, and an admin, may change it
        applied, _ = deciding.approve(self.csm, action.pk)
        self.assertEqual(applied.status, "applied")

    def test_every_decision_is_audited(self):
        deciding.approve(self.csm, self.lifecycle().pk)
        deciding.reject(self.mona, self.lifecycle(self.dough).pk)
        stale = self.lifecycle(self.soup)
        Customer.objects.filter(pk=self.soup.pk).update(lifecycle_stage="churn")
        with self.assertRaises(deciding.Expired):
            deciding.approve(self.admin, stale.pk)
        auto = self.lifecycle(self.loose)
        deciding.apply_action(auto, None, auto=True)
        self.assertEqual(self.audited("agent_action.approved").count(), 2)
        self.assertEqual(self.audited("agent_action.rejected").count(), 1)
        self.assertEqual(self.audited("agent_action.expired").count(), 1)
        event = self.audited("agent_action.approved").get(actor=self.csm)
        self.assertEqual(event.metadata["decided_as"], "owner")
        self.assertEqual(event.metadata["kind"], "record.lifecycle")
        auto_event = self.audited("agent_action.approved").get(actor=None)
        self.assertTrue(auto_event.metadata["auto"])

    def test_a_reader_without_the_owner_right_is_refused_before_any_expiry(self):
        action = self.owner_change()
        Customer.objects.filter(pk=self.pizza.pk).update(owner=self.mona)
        only_view_all = lambda user, capability: capability == "view_all_accounts"  # noqa: E731
        before = AuditEvent.objects.count()
        with patch.object(User, "has_capability", only_view_all):
            with self.assertRaises(deciding.CantDecide):
                deciding.approve(self.lee, action.pk)
        self.assertEqual(AgentAction.objects.get(pk=action.pk).status, "proposed")
        self.assertEqual(AuditEvent.objects.count(), before)

    def test_403_comes_before_already_decided(self):
        action = self.owner_change()
        deciding.approve(self.csm, action.pk)
        only_view_all = lambda user, capability: capability == "view_all_accounts"  # noqa: E731
        with patch.object(User, "has_capability", only_view_all):
            with self.assertRaises(deciding.CantDecide):
                deciding.approve(self.lee, action.pk)

    def test_a_stale_raised_by_apply_expires_it_and_leaves_no_partial_write(self):
        action = self.lifecycle()
        with patch.dict(
            "services.agents.deciding.REGISTRY",
            {"record.lifecycle": self._raising(deciding.REGISTRY["record.lifecycle"])},
        ):
            with self.assertRaises(deciding.Expired) as caught:
                deciding.approve(self.csm, action.pk)
        self.assertEqual(caught.exception.action.expired_reason, "changed")
        self.pizza.refresh_from_db()
        self.assertNotEqual(self.pizza.lifecycle_stage, "renewal")
        self.assertFalse(Feedback.objects.filter(subject_id=action.pk).exists())
        self.assertEqual(self.audited("agent_action.expired").count(), 1)
        self.assertFalse(self.audited("agent_action.approved").exists())

    @staticmethod
    def _raising(spec):
        def apply(action, actor, **kw):
            spec.apply(action, actor, **kw)  # writes, then refuses
            raise Stale("moved")

        return dataclasses.replace(spec, apply=apply)

    def test_an_owner_action_whose_record_is_gone_expires_as_changed(self):
        action = self.owner_change()
        AgentAction.objects.filter(pk=action.pk).update(customer=None, account=None)
        with self.assertRaises(deciding.Expired) as caught:
            deciding.approve(self.admin, action.pk)
        self.assertEqual(caught.exception.action.expired_reason, "changed")
