"""The intake's rows (agent bundles D2 contract §1): one SignalThread per
conversation, unique per workspace, source and external id; the bundle's
thread, department, newer-message flag, refresh stamp and rejecter; a
step's edited stamp; the workspace's interval and source switches, with
every source on and one hour by default (D2-21, D2-26). Rejected bundles
from delivery 1 get their rejecter from their steps."""

from importlib import import_module

from django.apps import apps
from django.db import IntegrityError, transaction
from django.utils import timezone

from services.accounts.models import Organisation
from services.agents.models import AgentBundle, SignalThread
from services.agents.tests.bundle_fixtures import BundleFixture, note
from services.metrics.models import AgentAction


class SignalThreadModelTests(BundleFixture):
    def thread(self, **fields):
        values = {
            "organisation": self.org,
            "source_kind": SignalThread.SourceKind.ZENDESK,
            "external_id": "4:1042",
            "customer": self.pizza,
            "last_message_at": timezone.now(),
        }
        return SignalThread.objects.create(**{**values, **fields})

    def test_one_thread_per_workspace_source_and_external_id(self):
        self.thread()
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.thread()
        self.thread(source_kind=SignalThread.SourceKind.SLACK)  # another source: fine
        self.assertEqual(
            str(SignalThread.objects.first()), f"Signal thread {SignalThread.objects.first().pk}"
        )

    def test_a_new_thread_waits_and_names_its_record(self):
        thread = self.thread()
        self.assertEqual((thread.status, thread.skip_reason, thread.failures), ("new", "", 0))
        self.assertEqual(thread.record, self.pizza)
        self.assertIsNone(thread.processed_through)

    def test_a_bundle_knows_its_thread_department_and_flags(self):
        thread = self.thread()
        bundle = self.bundle_of(self.pizza, note())
        AgentBundle.objects.filter(pk=bundle.pk).update(
            source="thread", thread=thread, department="cs", has_newer_message=True
        )
        bundle.refresh_from_db()
        self.assertEqual(
            (bundle.thread, bundle.department, bundle.has_newer_message), (thread, "cs", True)
        )
        self.assertIsNone(bundle.refreshed_at)
        self.assertIsNone(bundle.rejected_by)
        self.assertEqual(list(thread.bundles.all()), [bundle])

    def test_a_step_has_no_edit_until_a_person_edits_it(self):
        step = self.bundle_of(self.pizza, note()).steps.get()
        self.assertIsNone(step.edited_at)

    def test_the_workspace_reads_every_hour_with_every_source_on(self):
        org = Organisation.objects.get(pk=self.org.pk)
        self.assertEqual((org.ai_signal_interval, org.ai_signal_sources), ("1h", {}))
        self.assertIsNone(org.ai_signals_ran_at)
        self.assertEqual(
            Organisation.SignalInterval.choices,
            [
                ("30m", "Every 30 minutes"),
                ("1h", "Every hour"),
                ("4h", "Every 4 hours"),
                ("24h", "Once a day"),
            ],
        )

    def test_the_backfill_names_who_rejected_a_delivery_1_bundle(self):
        bundle = self.bundle_of(self.pizza, note())
        AgentAction.objects.filter(bundle=bundle).update(status="rejected", decided_by=self.csm)
        AgentBundle.objects.filter(pk=bundle.pk).update(status="rejected")
        untouched = self.bundle_of(self.pizza, note("Other", "Body"))
        backfill = import_module("services.agents.migrations.0005_bundle_rejected_by").backfill
        backfill(apps, None)
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).rejected_by_id, self.csm.pk)
        self.assertIsNone(AgentBundle.objects.get(pk=untouched.pk).rejected_by_id)
