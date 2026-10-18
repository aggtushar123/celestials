"""The OpenAPI schema renders for a caller who isn't signed in (agent
bundles D2 contract, D2-32). drf-spectacular builds every serializer with
the request it has; for `/api/schema/` and `manage.py spectacular` that is
an AnonymousUser, and `AccountSerializer.get_fields` read its organisation."""

import os
import tempfile

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient


class SchemaTests(TestCase):
    def test_the_schema_renders_for_a_signed_out_caller(self):
        response = APIClient().get("/api/schema/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"/api/v1/agents/bundles/{id}/run/", response.content)

    def test_manage_py_spectacular_writes_the_schema(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "schema.yml")
            call_command("spectacular", "--file", path)
            with open(path, encoding="utf-8") as written:
                self.assertIn("/api/v1/work/queues/", written.read())
