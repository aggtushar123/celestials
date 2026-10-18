"""The advisory lock releases best-effort: never at the cost of hiding
whatever the `with` block actually raised."""

from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from services.brain import locks


class ReleaseTests(SimpleTestCase):
    def test_skips_the_unlock_when_the_connection_is_in_an_aborted_block(self):
        fake = MagicMock(in_atomic_block=True, needs_rollback=True)
        with patch("services.brain.locks.connection", fake):
            with self.assertLogs("services.brain.locks", level="WARNING") as logs:
                locks._release("brain:1:brief:me:1")
        fake.cursor.assert_not_called()
        self.assertIn("brain:1:brief:me:1", logs.output[0])

    def test_a_failed_unlock_is_logged_not_raised(self):
        cursor = MagicMock()
        cursor.__enter__.return_value = cursor
        cursor.execute.side_effect = Exception("connection already closed")
        fake = MagicMock(in_atomic_block=False, needs_rollback=False)
        fake.cursor.return_value = cursor
        with patch("services.brain.locks.connection", fake):
            with self.assertLogs("services.brain.locks", level="WARNING") as logs:
                locks._release("brain:1:brief:me:1")  # must not raise
        self.assertIn("brain:1:brief:me:1", logs.output[0])

    def test_a_usable_connection_releases_normally(self):
        cursor = MagicMock()
        cursor.__enter__.return_value = cursor
        fake = MagicMock(in_atomic_block=False, needs_rollback=False)
        fake.cursor.return_value = cursor
        with patch("services.brain.locks.connection", fake):
            locks._release("brain:1:brief:me:1")
        cursor.execute.assert_called_once_with(locks._UNLOCK_SQL, ["brain:1:brief:me:1"])

    def test_an_exception_from_the_with_block_still_propagates(self):
        fake = MagicMock(in_atomic_block=False, needs_rollback=False)
        fake.cursor.return_value.__enter__.return_value = MagicMock()
        with patch("services.brain.locks.connection", fake):
            with self.assertRaises(ValueError):
                with locks.held(1, "brief:me:1"):
                    raise ValueError("boom")
