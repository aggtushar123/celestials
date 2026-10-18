"""Slack escalations D2 SE2-9: a change to a customer's account team is
written down; a refused or empty change is not."""

from unittest import mock

from core.models import AuditEvent
from services.knowledge.tests.heads_fixtures import HeadsFixture
from services.notifications.models import Notification


class AccountTeamAuditTests(HeadsFixture):
    def url(self, customer):
        return f"/api/v1/customers/{customer.id}/responsible/"

    def events(self):
        return list(
            AuditEvent.objects.filter(action="function_owner.changed")
            .order_by("id")
            .values_list("target_id", "metadata")
        )

    def actors(self):
        return set(
            AuditEvent.objects.filter(action="function_owner.changed").values_list(
                "actor_id", flat=True
            )
        )

    def test_set_replace_and_clear_are_each_one_row(self):
        api = self.as_(self.alice)
        url = self.url(self.globex)
        for user_id in (self.erin.id, self.erin.id, self.jesh.id, None, None):
            self.assertEqual(
                api.patch(
                    url, {"function": "engineering", "user_id": user_id}, format="json"
                ).status_code,
                200,
            )
        target = str(self.globex.id)
        self.assertEqual(
            self.events(),
            [
                (target, {"function": "engineering", "from": None, "to": self.erin.id}),
                (target, {"function": "engineering", "from": self.erin.id, "to": self.jesh.id}),
                (target, {"function": "engineering", "from": self.jesh.id, "to": None}),
            ],
        )
        self.assertEqual(self.actors(), {self.alice.id})

    def test_customer_success_is_the_owner(self):
        answer = self.as_(self.alice).patch(
            self.url(self.globex), {"function": "cs", "user_id": self.carl.id}, format="json"
        )
        self.assertEqual(answer.status_code, 200)
        self.assertEqual(
            self.events(),
            [(str(self.globex.id), {"function": "cs", "from": self.faiz.id, "to": self.carl.id})],
        )

    def test_customer_success_to_the_same_owner_writes_nothing(self):
        answer = self.as_(self.alice).patch(
            self.url(self.globex), {"function": "cs", "user_id": self.faiz.id}, format="json"
        )
        self.assertEqual(answer.status_code, 200)
        self.assertEqual(self.events(), [])

    def test_the_new_account_owner_is_told_after_the_change_commits(self):
        api = self.as_(self.alice)
        url = self.url(self.globex)

        def told(user):
            return Notification.objects.filter(recipient=user, kind="customer_assigned")

        for user in (self.carl, self.alice, self.carl):
            with self.captureOnCommitCallbacks(execute=True):
                api.patch(url, {"function": "cs", "user_id": user.id}, format="json")
            if user is self.alice:
                self.assertFalse(told(self.alice).exists())
        # Carl again after Alice is a new owner change, so a second note; the
        # unchanged case is checked next.
        self.assertEqual(told(self.carl).count(), 2)
        with self.captureOnCommitCallbacks(execute=True):
            api.patch(url, {"function": "cs", "user_id": self.carl.id}, format="json")
        self.assertEqual(told(self.carl).count(), 2)
        self.assertIn("made you the account owner", told(self.carl).first().message)

    def test_the_change_and_its_audit_row_commit_together(self):
        api = self.as_(self.alice)
        api.raise_request_exception = False
        with mock.patch("core.audit.record", side_effect=RuntimeError("audit down")):
            answer = api.patch(
                self.url(self.globex),
                {"function": "engineering", "user_id": self.erin.id},
                format="json",
            )
        self.assertEqual(answer.status_code, 500)
        self.assertFalse(self.globex.function_owners.exists())
        self.assertEqual(self.events(), [])

    def test_refusals_write_nothing(self):
        # Carl has no view-all-accounts.
        self.assertEqual(
            self.as_(self.carl)
            .patch(
                self.url(self.globex),
                {"function": "engineering", "user_id": self.erin.id},
                format="json",
            )
            .status_code,
            403,
        )
        # Faiz works in Customer Success, not Engineering.
        self.assertEqual(
            self.as_(self.alice)
            .patch(
                self.url(self.globex),
                {"function": "engineering", "user_id": self.faiz.id},
                format="json",
            )
            .status_code,
            400,
        )
        self.assertEqual(self.events(), [])
