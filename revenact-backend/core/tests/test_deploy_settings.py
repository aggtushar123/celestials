"""Integration tier: the deployment-facing settings (Cloud Run). STORAGES and
MIDDLEWARE are decided once at import, so each case loads the settings in a
fresh interpreter with the environment a deployment would give it."""

import json
import os
import subprocess
import sys
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

BASE_DIR = Path(__file__).resolve().parents[2]

PROBE = """
import json, django
django.setup()
from django.conf import settings as s
print(json.dumps({"default": s.STORAGES["default"], "static": s.STORAGES["staticfiles"]}))
"""


def _storages(**env):
    result = subprocess.run(
        [sys.executable, "-c", PROBE],
        cwd=BASE_DIR,
        env={**os.environ, "DJANGO_SETTINGS_MODULE": "config.settings", **env},
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout.strip().splitlines()[-1])


class DeploySettingsTests(SimpleTestCase):
    def test_whitenoise_serves_static_right_after_the_security_middleware(self):
        middleware = settings.MIDDLEWARE
        self.assertEqual(
            middleware.index("whitenoise.middleware.WhiteNoiseMiddleware"),
            middleware.index("django.middleware.security.SecurityMiddleware") + 1,
        )

    def test_uploads_go_to_the_private_bucket_when_one_is_named(self):
        storages = _storages(GS_BUCKET_NAME="revenact-prod-media")

        self.assertEqual(
            storages["default"]["BACKEND"], "storages.backends.gcloud.GoogleCloudStorage"
        )
        options = storages["default"]["OPTIONS"]
        self.assertEqual(options["bucket_name"], "revenact-prod-media")
        self.assertIsNone(options["default_acl"])
        self.assertFalse(options["file_overwrite"])
        self.assertTrue(options["querystring_auth"])
        self.assertEqual(
            storages["static"]["BACKEND"], "whitenoise.storage.CompressedStaticFilesStorage"
        )

    def test_uploads_stay_on_disk_without_a_bucket(self):
        storages = _storages(GS_BUCKET_NAME="")

        self.assertEqual(
            storages["default"]["BACKEND"], "django.core.files.storage.FileSystemStorage"
        )


class ChannelLayerClientTests(SimpleTestCase):
    def test_redis_py_never_times_out_an_idle_channel_receive(self):
        # channels-redis 4.x blocks in BZPOPMIN for brpop_timeout (5 s) on an
        # idle receive. redis-py 8 reads with a 5 s socket timeout by default,
        # so the empty reply loses the race and every idle WebSocket closed
        # with 1011 on Cloud Run (2026-10-15). Raise the pin in requirements.txt
        # only together with a channels-redis that sets its own read timeout.
        import redis
        from channels_redis.core import RedisChannelLayer

        major = int(redis.__version__.split(".")[0])
        self.assertLess(major, 8, f"redis-py {redis.__version__} with channels-redis 4.x")
        self.assertEqual(RedisChannelLayer.brpop_timeout, 5)
