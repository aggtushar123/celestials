"""Slack escalations D2 contract §1.1, SE2-2 to SE2-6: one head per
function per workspace, an active member of that function, off duty once
they leave or move, every real change audited."""

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from core.models import AuditEvent
from services.accounts.models import User
from services.knowledge import heads
from services.knowledge.models import FunctionHead
from services.knowledge.tests.heads_fixtures import HeadsFixture


class FunctionHeadModelTests(HeadsFixture):
    def test_the_head_works_in_the_function(self):
        with self.assertRaises(ValidationError) as refused:
            FunctionHead(organisation=self.org, function="engineering", user=self.faiz).save()
        self.assertEqual(
            refused.exception.message_dict["user"],
            ["Faiz Jamal is in Customer Success, not Engineering. Pick someone from Engineering."],
        )

    def test_the_head_is_active(self):
        User.objects.filter(pk=self.jesh.pk).update(is_active=False)
        self.jesh.refresh_from_db()
        with self.assertRaises(ValidationError) as refused:
            FunctionHead(organisation=self.org, function="engineering", user=self.jesh).save()
        self.assertEqual(
            refused.exception.message_dict["user"],
            ["Jesh Sanghvi is deactivated. Pick an active member."],
        )

    def test_the_head_is_a_member_of_the_workspace(self):
        with self.assertRaises(ValidationError) as refused:
            FunctionHead(organisation=self.org, function="engineering", user=self.zed).save()
        self.assertEqual(refused.exception.message_dict["user"], ["No such member."])

    def test_one_head_per_function_per_workspace(self):
        FunctionHead.objects.create(organisation=self.org, function="engineering", user=self.jesh)
        with self.assertRaises(IntegrityError), transaction.atomic():
            FunctionHead.objects.create(
                organisation=self.org, function="engineering", user=self.erin
            )
        # Another workspace has its own.
        FunctionHead.objects.create(
            organisation=self.elsewhere, function="engineering", user=self.zed
        )


class HeadsModuleTests(HeadsFixture):
    def test_rows_are_the_six_functions_in_order(self):
        FunctionHead.objects.create(organisation=self.org, function="engineering", user=self.jesh)
        # Another workspace's head: never read here.
        FunctionHead.objects.create(
            organisation=self.elsewhere, function="engineering", user=self.zed
        )
        with self.assertNumQueries(1):
            answer = heads.rows(self.org.id)
        self.assertEqual(
            [row["function"] for row in answer],
            ["cs", "engineering", "sales", "analytics", "leadership", "other"],
        )
        self.assertEqual(
            answer[0], {"function": "cs", "function_display": "Customer Success", "user": None}
        )
        self.assertEqual(answer[1]["user"], {"id": self.jesh.id, "name": "Jesh Sanghvi"})
        self.assertTrue(all(row["user"] is None for row in answer[2:]))

    def test_a_head_who_left_or_moved_is_off_duty(self):
        FunctionHead.objects.create(organisation=self.org, function="engineering", user=self.jesh)
        FunctionHead.objects.create(organisation=self.org, function="cs", user=self.faiz)
        User.objects.filter(pk=self.jesh.pk).update(is_active=False)
        User.objects.filter(pk=self.faiz.pk).update(function=User.Function.SALES)
        answer = {row["function"]: row["user"] for row in heads.rows(self.org.id)}
        self.assertIsNone(answer["engineering"])
        self.assertIsNone(answer["cs"])
        self.assertIsNone(heads.head_for(self.org.id, "engineering"))
        self.assertIsNone(heads.head_for(self.org.id, "cs"))
        # The rows stay: naming someone else replaces them (SE2-4).
        self.assertEqual(FunctionHead.objects.filter(organisation=self.org).count(), 2)

    def test_head_for_is_one_query_and_reads_only_its_workspace(self):
        FunctionHead.objects.create(
            organisation=self.elsewhere, function="engineering", user=self.zed
        )
        with self.assertNumQueries(1):
            self.assertIsNone(heads.head_for(self.org.id, "engineering"))
        FunctionHead.objects.create(organisation=self.org, function="engineering", user=self.jesh)
        self.assertEqual(heads.head_for(self.org.id, "engineering"), self.jesh)
        self.assertIsNone(heads.head_for(None, "engineering"))

    def test_on_duty(self):
        self.assertTrue(heads.on_duty(self.jesh))
        self.assertTrue(heads.on_duty(self.jesh, "engineering"))
        self.assertFalse(heads.on_duty(self.jesh, "sales"))
        self.assertFalse(heads.on_duty(None))
        self.jesh.is_active = False
        self.assertFalse(heads.on_duty(self.jesh))

    def test_change_sets_replaces_and_clears_with_one_audit_row_each(self):
        heads.change(self.org, "engineering", self.jesh, request=None)
        heads.change(self.org, "engineering", self.jesh, request=None)  # the same: no row
        heads.change(self.org, "engineering", self.erin, request=None)
        heads.change(self.org, "engineering", None, request=None)
        heads.change(self.org, "engineering", None, request=None)  # already nobody: no row
        self.assertFalse(FunctionHead.objects.filter(organisation=self.org).exists())
        events = list(AuditEvent.objects.filter(action="function_head.changed").order_by("id"))
        self.assertEqual(
            [e.metadata for e in events],
            [
                {"function": "engineering", "from": None, "to": self.jesh.id},
                {"function": "engineering", "from": self.jesh.id, "to": self.erin.id},
                {"function": "engineering", "from": self.erin.id, "to": None},
            ],
        )
        self.assertTrue(all(e.organisation_id == self.org.id for e in events))
        self.assertTrue(all(e.target_type == "accounts.organisation" for e in events))

    def test_a_refused_change_changes_nothing(self):
        heads.change(self.org, "engineering", self.jesh, request=None)
        with self.assertRaises(ValidationError):
            heads.change(self.org, "engineering", self.faiz, request=None)
        self.assertEqual(heads.head_for(self.org.id, "engineering"), self.jesh)
        self.assertEqual(AuditEvent.objects.filter(action="function_head.changed").count(), 1)
