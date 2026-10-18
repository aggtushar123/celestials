"""The feed's words and shapes, without a database (contract §2)."""

import base64
import json
from datetime import UTC, date, datetime

from django.db.models import Q
from django.test import SimpleTestCase

from services.work import feed_shape as fs

AT = datetime(2026, 10, 11, 9, 0, tzinfo=UTC)


class KindFilterTests(SimpleTestCase):
    def test_absent_means_every_kind(self):
        self.assertEqual(fs.parse_kinds(None), frozenset(fs.KINDS))

    def test_a_list(self):
        self.assertEqual(
            fs.parse_kinds("bundle, rule_review,bundle"), frozenset({"bundle", "rule_review"})
        )

    def test_approval_is_read_as_bundle(self):
        self.assertEqual(
            fs.parse_kinds("approval, rule_review,bundle"), frozenset({"bundle", "rule_review"})
        )

    def test_empty_or_unknown_is_refused(self):
        for raw in ("", " , ", "approval,tasks", "overdue_task"):
            with self.assertRaises(fs.BadQuery) as caught:
                fs.parse_kinds(raw)
            self.assertEqual(
                (caught.exception.field, caught.exception.message), ("kind", fs.CHOOSE_KIND)
            )


class CursorTests(SimpleTestCase):
    def test_round_trips_each_groups_position(self):
        for key, values in (
            ("decide", (AT, 1, 41)),
            ("overdue", (date(2026, 10, 1), 0, AT, 7)),
            ("no_date", (date.max, 2, AT, 9)),
            ("suggested", (AT, 3)),
        ):
            token = fs.encode(key, values)
            self.assertRegex(token, r"^[A-Za-z0-9_-]+$")
            self.assertEqual(fs.decode(key, token), values)

    def test_a_cursor_for_another_group_or_of_the_wrong_shape_is_stale(self):
        overdue = fs.encode("overdue", (date(2026, 10, 1), 0, AT, 7))
        for key, token in (
            ("today", overdue),
            ("decide", overdue),
            ("decide", "not-a-cursor"),
            ("decide", ""),
            ("decide", fs.encode("decide", (AT, 1))),
            ("suggested", fs.encode("suggested", (date(2026, 10, 1), 3))),
        ):
            with self.assertRaises(fs.BadQuery) as caught:
                fs.decode(key, token)
            self.assertEqual(caught.exception.message, fs.STALE_CURSOR, (key, token))

    def test_a_hand_made_cursor_with_an_illegal_value_is_stale(self):
        for values in (
            [["t", "2026-10-01T09:00:00"], ["i", 1], ["i", 41]],
            [["t", AT.isoformat()], ["i", 10**30], ["i", 41]],
        ):
            text = json.dumps(["decide", values])
            token = base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")
            with self.assertRaises(fs.BadQuery) as caught:
                fs.decode("decide", token)
            self.assertEqual(caught.exception.message, fs.STALE_CURSOR, values)


class KeysetTests(SimpleTestCase):
    def test_strictly_after_in_order(self):
        self.assertEqual(
            fs.after_q(("a", "b", "c"), (1, 2, 3)),
            Q(a__gt=1) | Q(a=1, b__gt=2) | Q(a=1, b=2, c__gt=3),
        )

    def test_descending(self):
        self.assertEqual(
            fs.after_q(("a", "b"), (1, 2), descending=True), Q(a__lt=1) | Q(a=1, b__lt=2)
        )


class ShapeTests(SimpleTestCase):
    def test_an_item(self):
        entry = fs.item(
            key="task:5",
            kind="todo",
            pk=5,
            title="Book the room",
            record=None,
            source={"type": "person", "label": "Carl CSM"},
            at=AT,
            actions=("done", "open"),
            detail={},
            due_date=date(2026, 10, 14),
            priority="high",
            private=True,
        )
        self.assertEqual(
            entry,
            {
                "key": "task:5",
                "kind": "todo",
                "id": 5,
                "title": "Book the room",
                "record": None,
                "from": {"type": "person", "label": "Carl CSM"},
                "at": "2026-10-11T09:00:00Z",
                "due_date": "2026-10-14",
                "priority": "high",
                "private": True,
                "actions": ["done", "open"],
                "detail": {},
            },
        )

    def test_a_group_pages_at_fifty(self):
        rows = [((AT, 0, n), {"id": n}) for n in range(51)]
        page = fs.group("decide", 80, rows)
        self.assertEqual((page["key"], page["count"], len(page["items"])), ("decide", 80, 50))
        self.assertEqual(fs.decode("decide", page["next"]), (AT, 0, 49))
        self.assertIsNone(fs.group("decide", 50, rows[:50])["next"])
        self.assertEqual(
            fs.group("today", 0, []), {"key": "today", "count": 0, "items": [], "next": None}
        )

    def test_groups_and_kinds_are_in_the_contracts_order(self):
        self.assertEqual(
            fs.GROUPS,
            ("decide", "overdue", "today", "week", "later", "no_date", "blocked", "suggested"),
        )
        self.assertEqual(
            fs.KINDS,
            (
                "bundle",
                "rule_review",
                "question",
                "draft",
                "task",
                "todo",
                "suggestion",
                "slack_message",
                "meeting_proposal",
                "email_suggestion",
            ),
        )
