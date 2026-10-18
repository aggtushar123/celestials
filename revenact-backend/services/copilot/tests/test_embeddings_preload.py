"""EMBEDDINGS_PRELOAD: the ASGI app warms the embedding model as it starts
(Cloud Run's web service), and leaves it lazy otherwise."""

import importlib
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

import config.asgi


class PreloadTests(SimpleTestCase):
    def load_asgi(self):
        with patch("services.copilot.embeddings.warm") as warm:
            importlib.reload(config.asgi)
        return warm

    @override_settings(EMBEDDINGS_PRELOAD=True)
    def test_the_asgi_app_warms_the_model_when_asked(self):
        self.load_asgi().assert_called_once_with()

    @override_settings(EMBEDDINGS_PRELOAD=False)
    def test_the_model_stays_lazy_by_default(self):
        self.load_asgi().assert_not_called()

    def test_warm_runs_the_model_once(self):
        with patch("services.copilot.embeddings.embed") as embed:
            from services.copilot.embeddings import warm

            warm()
        embed.assert_called_once_with(["warm up"])
