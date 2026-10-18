"""Counted, not named (spec §4, §6): for a member, a manager, a view-all
reader, a Leadership reader, someone suggested but not deciding, and someone
from another workspace, no Recommended response names a record they cannot
open, and the decision routes treat such a recommendation as missing.

Mona was made the recipient of a recommendation about Dana's Taco West
(routed before she lost access): she sees it counted, never named. Only
Alice (view-all) may open and decide it."""

import json

from services.work.tests.recommend_fixtures import RecommendFixture

URL = "/api/v1/work/recommendations/"
SECRET = "Taco West"


class RecommendPrivacyTests(RecommendFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.dough_rec = cls.make_rec(on=cls.dough, recipient=cls.mona, suggested=cls.csm)
        cls.pizza_rec = cls.make_rec(on=cls.pizza, recipient=cls.csm, suggested=cls.csm)
        cls.west_rec = cls.make_rec(
            on=cls.west,
            recipient=cls.mona,
            suggested=cls.other,
            title="Prepare Taco West's renewal",
        )
        cls.loose_rec = cls.make_rec(on=cls.loose, recipient=cls.admin)

    def read(self, reader, scope):
        body = self.ok(reader, f"{URL}?scope={scope}")
        return body["count"], body["hidden"], json.dumps(body)

    def test_each_reader_sees_what_they_may_decide_and_open(self):
        expected = [
            # reader, (me: count, hidden), (team: count, hidden)
            (self.csm, (1, 0), (1, 0)),
            (self.mona, (1, 1), (2, 1)),
            (self.admin, (1, 0), (4, 0)),
            (self.lee, (0, 0), (0, 0)),
            (self.other, (0, 0), (0, 0)),
            (self.stranger, (0, 0), (0, 0)),
        ]
        for reader, me, team in expected:
            with self.subTest(reader=reader.name):
                self.assertEqual(self.read(reader, "me")[:2], me)
                self.assertEqual(self.read(reader, "team")[:2], team)

    def test_nobody_who_cannot_open_taco_west_reads_its_name(self):
        for reader in (self.csm, self.mona, self.lee, self.other, self.stranger):
            for scope in ("me", "team"):
                with self.subTest(reader=reader.name, scope=scope):
                    self.assertNotIn(SECRET, self.read(reader, scope)[2])
        self.assertIn(SECRET, self.read(self.admin, "team")[2])

    def test_the_decision_routes_treat_it_as_missing(self):
        actions = (
            ("assign", {"assignee_id": self.other.pk}),
            ("dismiss", {"reason": "not_relevant"}),
        )
        for reader in (self.mona, self.csm, self.lee, self.stranger):
            for action, body in actions:
                with self.subTest(reader=reader.name, action=action):
                    response = self.post(reader, f"{URL}{self.west_rec.pk}/{action}/", body)
                    self.assertEqual(
                        (response.status_code, response.data),
                        (404, {"detail": "No such recommendation."}),
                    )
        response = self.post(
            self.admin, f"{URL}{self.west_rec.pk}/assign/", {"assignee_id": self.other.pk}
        )
        self.assertEqual(response.status_code, 201, response.data)

    def test_dana_cannot_decide_what_only_suggests_her(self):
        # Dana can open Taco West (she owns it) but is neither its recipient nor above anyone.
        response = self.post(
            self.other, f"{URL}{self.west_rec.pk}/dismiss/", {"reason": "other", "note": "x"}
        )
        self.assertEqual(response.status_code, 403)

    def test_another_workspace_reads_nothing_of_this_one(self):
        for scope in ("me", "team"):
            text = self.read(self.stranger, scope)[2]
            for name in ("Pizza Hut", "Dough Co", "Carl CSM", "Mona Manager"):
                with self.subTest(scope=scope, name=name):
                    self.assertNotIn(name, text)
        response = self.post(self.stranger, f"{URL}{self.dough_rec.pk}/assign/", {"assignee_id": 1})
        self.assertEqual(response.status_code, 404)
        # Gus's own workspace's settings, never Acme's
        self.assertEqual(
            self.ok(self.stranger, "/api/v1/work/settings/")["recommend_to"], "manager"
        )
        self.prefer(recommend_to="owner")
        self.assertEqual(
            self.ok(self.stranger, "/api/v1/work/settings/")["recommend_to"], "manager"
        )
