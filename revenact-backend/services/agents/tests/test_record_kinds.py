"""record.lifecycle, record.owner and record.attribute (spec §1.3): each
validates against the evidence, applies through a person's path, and undoes
only while nothing has changed since."""

import math

from services.agents.actions import records
from services.agents.evidence import Context
from services.agents.kinds import ChangedSince, Invalid, Stale
from services.agents.tests.fixtures import AgentsFixture
from services.attributes.models import AIAttribute, AIAttributeValue
from services.customers.models import Account, Customer
from services.knowledge.models import Contribution
from services.metrics.models import AgentAction
from services.notifications.models import Notification


def row_for(record, kind="customer", **extra):
    owner = record.owner
    return {
        "ref": f"{kind}:{record.pk}",
        "kind": kind,
        "id": record.pk,
        "name": record.name,
        "owner": None if owner is None else {"id": owner.pk, "name": owner.name},
        "lifecycle": record.lifecycle_stage,
        "attributes": [],
        "tasks": [],
        **extra,
    }


class RecordKindsTests(AgentsFixture):
    def ctx(self):
        members = {u.pk: {"id": u.pk, "name": u.name} for u in (self.csm, self.mona, self.other)}
        return Context(self.org, "cs", self.today, members=members)

    def action(self, kind, payload, *, record=None, before=None):
        record = record or self.pizza
        return AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind=kind,
            customer=record if isinstance(record, Customer) else None,
            account=record if isinstance(record, Account) else None,
            target=kind,
            title="t",
            rationale="r",
            payload=payload,
            before=before,
        )

    # lifecycle

    def test_lifecycle_validates_the_stage_and_refuses_no_change(self):
        row = row_for(self.pizza)
        self.assertEqual(
            records.LIFECYCLE.validate({"stage": "Renewal"}, row, self.ctx(), []),
            {"stage": "renewal"},
        )
        for bad in ({"stage": "at_risk"}, {"stage": self.pizza.lifecycle_stage}, {}):
            with self.subTest(bad=bad), self.assertRaises(Invalid):
                records.LIFECYCLE.validate(bad, row, self.ctx(), [])

    def test_lifecycle_applies_previews_and_undoes(self):
        start = self.pizza.lifecycle_stage
        action = self.action("record.lifecycle", {"stage": "renewal"}, before=start)
        self.assertEqual(records.LIFECYCLE.current(action), start)
        after, result = records.LIFECYCLE.apply(action, self.mona)
        self.assertEqual((after, result), ("renewal", {}))
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.lifecycle_stage, "renewal")
        action.after = after
        preview = records.LIFECYCLE.preview(action)
        self.assertEqual(preview["field"], "Lifecycle stage")
        self.assertEqual(preview["to"], "Renewal")
        records.LIFECYCLE.undo(action, self.mona)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.lifecycle_stage, start)

    def test_lifecycle_undo_refuses_after_someone_changed_it(self):
        action = self.action("record.lifecycle", {"stage": "renewal"}, before="live")
        action.after, _ = records.LIFECYCLE.apply(action, None)
        type(self.pizza).objects.filter(pk=self.pizza.pk).update(lifecycle_stage="churn")
        with self.assertRaises(ChangedSince) as caught:
            records.LIFECYCLE.undo(action, self.mona)
        self.assertEqual(caught.exception.current, "Churn")
        self.assertEqual(caught.exception.applied, "Renewal")
        self.assertEqual(
            caught.exception.detail, "Lifecycle stage has changed since: it is now Churn."
        )

    # owner

    def test_owner_needs_a_member_who_can_open_the_record(self):
        row = row_for(self.pizza)
        self.assertEqual(
            records.OWNER.validate({"owner_id": self.mona.pk}, row, self.ctx(), []),
            {"owner_id": self.mona.pk},
        )
        for bad in (
            {"owner_id": self.csm.pk},  # no change
            {"owner_id": self.other.pk},  # Dana can't open Pizza Hut
            {"owner_id": self.stranger.pk},  # not in the evidence
            {"owner_id": "2"},
        ):
            with self.subTest(bad=bad), self.assertRaises(Invalid):
                records.OWNER.validate(bad, row, self.ctx(), [])

    def test_owner_applies_through_the_handover_and_tells_the_new_owner(self):
        action = self.action("record.owner", {"owner_id": self.mona.pk}, before=self.csm.pk)
        action.after, _ = records.OWNER.apply(action, self.admin)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.owner_id, self.mona.pk)
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.mona, kind=Notification.Kind.CUSTOMER_ASSIGNED
            ).exists()
        )
        records.OWNER.undo(action, self.admin)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.owner_id, self.csm.pk)

    def test_owner_apply_is_stale_when_the_person_can_no_longer_open_it(self):
        action = self.action("record.owner", {"owner_id": self.other.pk}, before=self.csm.pk)
        with self.assertRaises(Stale):
            records.OWNER.apply(action, self.admin)

    # attribute

    def test_attribute_coerces_and_appends_then_undo_deletes_only_its_own_row(self):
        attribute = AIAttribute.objects.create(
            organisation=self.org,
            name="Renewal likelihood",
            api_name="renewal_likelihood",
            prompt="p",
            value_type=AIAttribute.ValueType.NUMBER,
        )
        ctx = self.ctx()
        ctx.attributes = {
            attribute.pk: {
                "id": attribute.pk,
                "name": attribute.name,
                "type": "number",
                "options": [],
                "applies_to": ("customer",),
            }
        }
        row = row_for(self.pizza, attributes=[{"id": attribute.pk, "value": 40}])
        clean = records.ATTRIBUTE.validate(
            {"attribute_id": attribute.pk, "value": "70%"}, row, ctx, []
        )
        self.assertEqual(clean, {"attribute_id": attribute.pk, "value": 70})
        with self.assertRaises(Invalid):
            records.ATTRIBUTE.validate({"attribute_id": attribute.pk, "value": 40}, row, ctx, [])
        action = self.action("record.attribute", clean)
        action.after, action.result = records.ATTRIBUTE.apply(action, None)
        latest = AIAttributeValue.objects.filter(attribute=attribute, customer=self.pizza).first()
        self.assertEqual((latest.value, latest.origin), (70, "ai"))
        records.ATTRIBUTE.undo(action, self.mona)
        self.assertFalse(AIAttributeValue.objects.filter(attribute=attribute).exists())
        # A newer row wins: undo refuses.
        action.after, action.result = records.ATTRIBUTE.apply(action, None)
        AIAttributeValue.objects.create(
            attribute=attribute, customer=self.pizza, value=10, origin="human"
        )
        with self.assertRaises(ChangedSince):
            records.ATTRIBUTE.undo(action, self.mona)

    # the account branch

    def acc_action(self, kind, payload, before=None):
        return self.action(kind, payload, record=self.emea, before=before)

    def test_account_owner_applies_and_undoes_through_the_account_handover(self):
        action = self.acc_action("record.owner", {"owner_id": self.mona.pk}, self.csm.pk)
        action.after, _ = records.OWNER.apply(action, self.admin)
        self.emea.refresh_from_db()
        self.assertEqual(self.emea.owner_id, self.mona.pk)
        self.assertTrue(
            Contribution.objects.filter(customer=self.pizza, body__contains="Pizza EMEA").exists()
        )
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.mona, kind=Notification.Kind.ACCOUNT_ASSIGNED
            ).exists()
        )
        records.OWNER.undo(action, self.admin)
        self.emea.refresh_from_db()
        self.assertEqual(self.emea.owner_id, self.csm.pk)

    def test_account_lifecycle_applies_and_undoes(self):
        start = self.emea.lifecycle_stage
        action = self.acc_action("record.lifecycle", {"stage": "renewal"}, start)
        action.after, _ = records.LIFECYCLE.apply(action, self.mona)
        self.emea.refresh_from_db()
        self.assertEqual(self.emea.lifecycle_stage, "renewal")
        records.LIFECYCLE.undo(action, self.mona)
        self.emea.refresh_from_db()
        self.assertEqual(self.emea.lifecycle_stage, start)

    def test_account_attribute_writes_and_removes_an_account_row(self):
        attribute = AIAttribute.objects.create(
            organisation=self.org,
            name="Seats",
            api_name="seats",
            prompt="p",
            value_type=AIAttribute.ValueType.NUMBER,
            applies_to_account=True,
        )
        action = self.acc_action("record.attribute", {"attribute_id": attribute.pk, "value": 5})
        action.after, action.result = records.ATTRIBUTE.apply(action, None)
        row = AIAttributeValue.objects.get(attribute=attribute)
        self.assertEqual((row.account_id, row.customer_id, row.value), (self.emea.pk, None, 5))
        records.ATTRIBUTE.undo(action, self.mona)
        self.assertFalse(AIAttributeValue.objects.filter(attribute=attribute).exists())

    def test_attribute_apply_is_stale_when_it_no_longer_applies(self):
        attribute = AIAttribute.objects.create(
            organisation=self.org,
            name="Seats",
            api_name="seats",
            prompt="p",
            value_type=AIAttribute.ValueType.NUMBER,
            applies_to_account=False,
        )
        action = self.acc_action("record.attribute", {"attribute_id": attribute.pk, "value": 5})
        with self.assertRaises(Stale):
            records.ATTRIBUTE.apply(action, None)

    def test_attribute_refuses_nan_and_infinity(self):
        attribute = AIAttribute.objects.create(
            organisation=self.org,
            name="Score",
            api_name="score",
            prompt="p",
            value_type=AIAttribute.ValueType.NUMBER,
        )
        ctx = self.ctx()
        ctx.attributes = {
            attribute.pk: {
                "id": attribute.pk,
                "name": "Score",
                "type": "number",
                "options": [],
                "applies_to": ("customer",),
            }
        }
        row = row_for(self.pizza)
        for bad in (math.nan, math.inf, "nan"):
            with self.subTest(bad=bad), self.assertRaises(Invalid):
                records.ATTRIBUTE.validate(
                    {"attribute_id": attribute.pk, "value": bad}, row, ctx, []
                )

    # the context's tenant scope

    def test_context_instance_is_scoped_to_the_workspace(self):
        ctx = self.ctx()
        self.assertEqual(ctx.instance(f"customer:{self.pizza.pk}"), self.pizza)
        self.assertEqual(ctx.instance(f"account:{self.emea.pk}"), self.emea)
        self.assertIsNone(ctx.instance(f"customer:{self.globex.pk}"))
        foreign = self.account("Globex EU", self.globex, self.stranger)
        self.assertIsNone(ctx.instance(f"account:{foreign.pk}"))
        self.assertIsNone(ctx.instance(f"thing:{self.pizza.pk}"))
        self.assertIsNone(ctx.instance("customer:x"))

    # owner, further

    def test_owner_undo_refuses_after_someone_reassigned_it(self):
        action = self.action("record.owner", {"owner_id": self.mona.pk}, before=self.csm.pk)
        action.after, _ = records.OWNER.apply(action, self.admin)
        type(self.pizza).objects.filter(pk=self.pizza.pk).update(owner=self.csm)
        with self.assertRaises(ChangedSince) as caught:
            records.OWNER.undo(action, self.admin)
        self.assertEqual(caught.exception.current, self.csm.name)

    def test_owner_undo_refuses_when_the_previous_owner_cannot_open_it(self):
        action = self.action("record.owner", {"owner_id": self.mona.pk}, before=self.other.pk)
        type(self.pizza).objects.filter(pk=self.pizza.pk).update(owner=self.mona)
        action.after = self.mona.pk
        with self.assertRaises(ChangedSince) as caught:
            records.OWNER.undo(action, self.admin)
        self.assertEqual(caught.exception.current, self.mona.name)
        self.assertEqual(caught.exception.applied, self.other.name)

    def test_owner_validate_refuses_an_inactive_listed_member(self):
        type(self.mona).objects.filter(pk=self.mona.pk).update(is_active=False)
        with self.assertRaises(Invalid):
            records.OWNER.validate({"owner_id": self.mona.pk}, row_for(self.pizza), self.ctx(), [])

    def test_owner_apply_needs_a_person(self):
        action = self.action("record.owner", {"owner_id": self.mona.pk}, before=self.csm.pk)
        with self.assertRaises(Stale):
            records.OWNER.apply(action, None)

    def test_a_person_is_recorded_as_the_editor(self):
        action = self.action("record.lifecycle", {"stage": "renewal"}, before="live")
        records.LIFECYCLE.apply(action, self.mona)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.modified_by_id, self.mona.pk)
