"""The workspace as an Open Knowledge Format v0.2 bundle
(services/knowledge/okf.py, GET /api/v1/knowledge/okf/): conformant (OKF
§11), metrics carry their attested computation with the month-end process
as verifier, people appear by name and id and never by email, another
workspace never leaks in, and only someone who may see every account can
export, audited."""

import io
import zipfile
from datetime import date

import yaml
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.accounts.models import Organisation, User
from services.customers.models import Customer
from services.knowledge.models import Contribution, FunctionOwner, Question
from services.knowledge.okf import build_bundle, conformance_errors
from services.metrics.models import MetricSnapshot
from services.metrics.registry import METRICS


def front(text):
    return yaml.safe_load(text.split("---\n", 2)[1])


class BundleTests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name="Alfee")
        self.admin = User.objects.create_user(
            email="tushar@alfee.io",
            password="pw-123456789",
            name="Tushar",
            organisation=self.org,
            role=User.Role.ADMIN,
        )
        self.csm = User.objects.create_user(
            email="faiz@alfee.io", password="pw-123456789", name="Faiz", organisation=self.org
        )
        self.engineer = User.objects.create_user(
            email="priya@alfee.io",
            password="pw-123456789",
            name="Priya",
            organisation=self.org,
            function=User.Function.ENGINEERING,
            reports_to=self.admin,
        )
        self.uber = Customer.objects.create(
            organisation=self.org,
            name="Uber",
            owner=self.csm,
            health_score=35,
            renewal_date=date(2026, 11, 30),
        )
        FunctionOwner.objects.create(customer=self.uber, function="engineering", user=self.engineer)
        self.note = Contribution.objects.create(
            organisation=self.org,
            customer=self.uber,
            author=self.csm,
            function="cs",
            body="SSO sessions drop hourly after token refresh. Fix ships in 2.4.",
        )
        answer = Contribution.objects.create(
            organisation=self.org,
            customer=self.uber,
            author=self.engineer,
            function="engineering",
            body="Release 2.4 ships on 25 Oct.",
        )
        Question.objects.create(
            organisation=self.org,
            customer=self.uber,
            asked_by=self.csm,
            assignee=self.engineer,
            text="When does the SSO fix ship?",
            status=Question.Status.ANSWERED,
            answer=answer,
        )
        MetricSnapshot.objects.create(
            organisation=self.org, metric="active_arr", period_end=date(2026, 9, 30), value=1000
        )
        other = Organisation.objects.create(name="Acme")
        Customer.objects.create(organisation=other, name="Globex")
        self.files = build_bundle(self.org, self.admin)

    def test_the_bundle_is_conformant_okf(self):
        self.assertEqual(conformance_errors(self.files), [])
        self.assertEqual(front(self.files["index.md"]), {"okf_version": "0.2"})
        self.assertIn("log.md", self.files)
        for directory in ("metrics", "computations", "customers", "knowledge", "references"):
            self.assertIn(f"{directory}/index.md", self.files)

    def test_every_metric_has_a_concept_and_an_attested_computation(self):
        for metric in METRICS:
            concept = front(self.files[f"metrics/{metric.key}.md"])
            self.assertEqual((concept["type"], concept["title"]), ("Metric", metric.label))
            computation = front(self.files[f"computations/{metric.key}.md"])
            self.assertEqual(computation["type"], "Attested Computation")
            self.assertEqual(computation["runtime"], "python")
            self.assertTrue(computation["executor"]["receipt"])
            self.assertIn("resource", computation["attester"])
            self.assertIn(
                f"](../computations/{metric.key}.md)", self.files[f"metrics/{metric.key}.md"]
            )

    def test_a_snapshotted_metric_is_verified_by_the_month_end_process_and_goes_stale(self):
        computation = front(self.files["computations/active_arr.md"])
        self.assertEqual(computation["verified"]["by"], "process:revenact-month-end")
        self.assertEqual(computation["stale_after"], "2026-11-01T00:00:00Z")
        unsnapshotted = front(self.files["computations/logo_retention.md"])
        self.assertNotIn("verified", unsnapshotted)

    def test_people_are_named_by_actor_id_never_by_email(self):
        everything = "".join(self.files.values())
        self.assertNotIn("@alfee.io", everything)
        note = front(self.files[f"knowledge/uber-{self.uber.pk}/note-{self.note.pk}.md"])
        self.assertEqual(note["generated"]["by"], f"human:faiz-{self.csm.pk}")
        self.assertEqual(note["type"], "Knowledge Note")
        self.assertEqual(note["sources"][0]["resource"], f"/customers/uber-{self.uber.pk}.md")

    def test_an_answered_question_carries_its_question_and_asker(self):
        (path,) = [p for p in self.files if "/question-" in p]
        answered = front(self.files[path])
        self.assertEqual(answered["type"], "Answered Question")
        self.assertEqual(answered["question"], "When does the SSO fix ship?")
        self.assertEqual(answered["asked_by"], f"human:faiz-{self.csm.pk}")
        self.assertEqual(answered["generated"]["by"], f"human:priya-{self.engineer.pk}")

    def test_a_customer_names_who_answers_for_it_and_goes_stale_at_renewal(self):
        text = self.files[f"customers/uber-{self.uber.pk}.md"]
        customer = front(text)
        self.assertEqual(customer["type"], "Customer")
        self.assertEqual(customer["stale_after"], "2026-11-30T00:00:00Z")
        self.assertIn("Customer Success (owner): Faiz", text)
        self.assertIn("Engineering: Priya", text)

    def test_a_note_outside_the_exporters_scope_is_never_exported(self):
        # Knowledge follows the org chart (services.accounts.hierarchy): an
        # analyst who reports to nobody here is outside Tushar's scope, and is
        # not responsible for Uber.
        analyst = User.objects.create_user(
            email="mei@alfee.io",
            password="pw-123456789",
            name="Mei",
            organisation=self.org,
            function=User.Function.ANALYTICS,
        )
        Contribution.objects.create(
            organisation=self.org,
            customer=self.uber,
            author=analyst,
            function="analytics",
            body="Private analytics aside about Uber's usage.",
        )
        files = build_bundle(self.org, self.admin)
        self.assertNotIn("Private analytics aside", "".join(files.values()))

    def test_another_workspace_never_appears(self):
        self.assertNotIn("Globex", "".join(self.files.values()))


class ExportViewTests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name="Alfee")
        self.admin = User.objects.create_user(
            email="tushar@alfee.io",
            password="pw-123456789",
            name="Tushar",
            organisation=self.org,
            role=User.Role.ADMIN,
        )
        self.csm = User.objects.create_user(
            email="faiz@alfee.io", password="pw-123456789", name="Faiz", organisation=self.org
        )
        self.api = APIClient()

    def test_someone_who_sees_every_account_downloads_a_zip_and_it_is_audited(self):
        self.api.force_authenticate(self.admin)
        response = self.api.get("/api/v1/knowledge/okf/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/zip")
        self.assertIn('filename="revenact-alfee-okf.zip"', response["Content-Disposition"])
        names = zipfile.ZipFile(io.BytesIO(response.content)).namelist()
        self.assertIn("revenact-alfee-okf/index.md", names)
        event = AuditEvent.objects.get(action="knowledge.okf_export")
        self.assertEqual(event.actor, self.admin)
        self.assertEqual(event.metadata["bytes"], len(response.content))

    def test_a_csm_who_sees_only_their_book_may_not_export(self):
        self.api.force_authenticate(self.csm)
        self.assertEqual(self.api.get("/api/v1/knowledge/okf/").status_code, 403)
        self.assertFalse(AuditEvent.objects.filter(action="knowledge.okf_export").exists())

    def test_anonymous_is_refused(self):
        self.assertEqual(self.api.get("/api/v1/knowledge/okf/").status_code, 401)
