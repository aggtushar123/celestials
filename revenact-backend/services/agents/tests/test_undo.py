"""Undo (spec §1.5): for 7 days, by anyone who could have approved it,
refused when the thing changed since; the approver (or the record owner for
Auto) is told."""

from datetime import timedelta

from django.utils import timezone

from core.audit import AuditEvent
from services.agents import deciding, undo
from services.agents.kinds import ChangedSince
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import Customer
from services.metrics.models import AgentAction
from services.notifications.models import Notification

K = Notification.Kind


class UndoTests(AgentsFixture):
    def applied(self, *, auto=False, decider=None):
        action = AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="record.lifecycle",
            customer=self.pizza,
            target="lifecycle",
            title="t",
            rationale="r",
            payload={"stage": "renewal"},
            before=self.pizza.lifecycle_stage,
        )
        return deciding.apply_action(action, decider, auto=auto)

    def test_undo_restores_and_tells_the_approver(self):
        action = self.applied(decider=self.mona)
        undone = undo.undo(self.csm, action.pk)
        self.assertEqual((undone.status, undone.undone_by), ("undone", self.csm))
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.lifecycle_stage, action.before)
        note = Notification.objects.get(kind=K.AGENT_ACTION_UNDONE)
        self.assertEqual(note.recipient, self.mona)
        self.assertEqual(
            note.message, "Carl CSM undid the CS agent's lifecycle change on Pizza Hut."
        )
        self.assertEqual(note.link, f"/work?queue=history&bundle={action.bundle_id}")

    def test_undo_is_audited_with_kind_agent_before_and_after(self):
        action = self.applied(decider=self.mona)
        undo.undo(self.csm, action.pk)
        event = AuditEvent.objects.get(action="agent_action.undone")
        self.assertEqual(event.actor, self.csm)
        for key, value in {
            "kind": "record.lifecycle",
            "agent": "cs",
            "before": action.before,
            "after": action.after,
        }.items():
            self.assertEqual(event.metadata[key], value)

    def test_auto_undo_tells_the_record_owner_and_not_the_undoer(self):
        action = self.applied(auto=True)
        undo.undo(self.mona, action.pk)
        self.assertEqual(
            list(
                Notification.objects.filter(kind=K.AGENT_ACTION_UNDONE).values_list(
                    "recipient", flat=True
                )
            ),
            [self.csm.pk],
        )
        action2 = self.applied(auto=True)
        undo.undo(self.csm, action2.pk)
        self.assertEqual(Notification.objects.filter(kind=K.AGENT_ACTION_UNDONE).count(), 1)

    def test_refusals_in_order(self):
        action = self.applied(decider=self.mona)
        with self.assertRaises(deciding.CantDecide):
            undo.undo(self.other, action.pk)
        AgentAction.objects.filter(pk=action.pk).update(
            applied_at=timezone.now() - timedelta(days=8)
        )
        with self.assertRaises(undo.UndoExpired):
            undo.undo(self.csm, action.pk)
        AgentAction.objects.filter(pk=action.pk).update(applied_at=timezone.now())
        Customer.objects.filter(pk=self.pizza.pk).update(lifecycle_stage="churn")
        with self.assertRaises(ChangedSince):
            undo.undo(self.csm, action.pk)
        Customer.objects.filter(pk=self.pizza.pk).update(lifecycle_stage="renewal")
        undo.undo(self.csm, action.pk)
        with self.assertRaises(deciding.AlreadyDecided) as caught:
            undo.undo(self.mona, action.pk)
        self.assertEqual(caught.exception.action.pk, action.pk)
        self.assertEqual(caught.exception.action.status, "undone")

    def test_only_an_applied_action_can_be_undone(self):
        action = AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="record.lifecycle",
            customer=self.pizza,
            target="lifecycle",
            title="t",
            rationale="r",
            payload={"stage": "renewal"},
        )
        with self.assertRaises(undo.NotApplied):
            undo.undo(self.csm, action.pk)

    def test_the_notice_is_generic_for_someone_who_cant_open_the_record(self):
        action = self.applied(decider=self.other)
        undo.undo(self.csm, action.pk)
        note = Notification.objects.get(kind=K.AGENT_ACTION_UNDONE)
        self.assertEqual(
            note.message, "Carl CSM undid an agent action on an organisation you can't open."
        )

    def test_an_initiative_undo_is_for_view_all_only(self):
        action = AgentAction.objects.create(
            organisation=self.org,
            agent="ops",
            batch="b",
            kind="initiative.create",
            target="initiative:x",
            title="t",
            rationale="r",
            payload={},
            status="applied",
            applied_at=timezone.now(),
        )
        with self.assertRaises(deciding.CantDecide):
            undo.undo(self.csm, action.pk)

    def test_expired_and_changed_answers_expired(self):
        action = self.applied(decider=self.mona)
        AgentAction.objects.filter(pk=action.pk).update(
            applied_at=timezone.now() - timedelta(days=8)
        )
        Customer.objects.filter(pk=self.pizza.pk).update(lifecycle_stage="churn")
        with self.assertRaises(undo.UndoExpired):
            undo.undo(self.csm, action.pk)

    def test_a_non_decider_on_an_unapplied_action_is_refused_as_such(self):
        action = AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="record.lifecycle",
            customer=self.pizza,
            target="lifecycle",
            title="t",
            rationale="r",
            payload={"stage": "renewal"},
        )
        with self.assertRaises(deciding.CantDecide):
            undo.undo(self.other, action.pk)

    def test_seven_days_less_a_minute_is_still_allowed(self):
        action = self.applied(decider=self.mona)
        AgentAction.objects.filter(pk=action.pk).update(
            applied_at=timezone.now() - timedelta(days=7) + timedelta(minutes=1)
        )
        self.assertEqual(undo.undo(self.csm, action.pk).status, "undone")

    def test_an_applied_action_with_no_applied_at_is_expired_not_a_crash(self):
        action = self.applied(decider=self.mona)
        AgentAction.objects.filter(pk=action.pk).update(applied_at=None)
        with self.assertRaises(undo.UndoExpired):
            undo.undo(self.csm, action.pk)


class IrreversibleUndoTests(AgentsFixture):
    def sent(self, kind, *, days):
        return AgentAction.objects.create(
            organisation=self.org,
            agent="ops",
            batch="b",
            kind=kind,
            target=f"{kind}:sent",
            title="t",
            rationale="r",
            payload={"name": "Q4", "draft_only": False},
            status="applied",
            applied_at=timezone.now() - timedelta(days=days),
            irreversible=True,
        )

    def test_an_irreversible_step_answers_its_kinds_sentence_before_the_window(self):
        # Contract §3: the kind's CHANGED_SINCE sentence, whether or not the
        # 7 days are up, and nothing undone.
        for kind, sentence in (
            ("survey.send", "This survey has been sent."),
            ("campaign.send", "This campaign has been sent."),
        ):
            for days in (1, 8):
                with self.subTest(kind=kind, days=days):
                    action = self.sent(kind, days=days)
                    with self.assertRaises(ChangedSince) as caught:
                        undo.undo(self.admin, action.pk)
                    self.assertEqual(caught.exception.detail, sentence)
                    action.refresh_from_db()
                    self.assertEqual(action.status, "applied")
